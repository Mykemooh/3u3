import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { tenants, wallets, walletLedger, voiceCalls } from '@/db/schema';
import { PLANS, USAGE, GUARDRAILS, planFor } from '@/lib/billing/plans';

/**
 * Prepaid usage — texts, Tex phone minutes and the business number are paid
 * from a company's credit balance before they happen, so the platform never
 * carries a company's costs (docs/billing.md).
 *
 * Rules:
 *  • Spend the plan's monthly allowance first, then the balance.
 *  • Reserve, then settle: charge before calling the provider; refund if the
 *    call fails.
 *  • The balance can never go below zero (a CHECK constraint backs this up),
 *    and every change is one row in the append-only ledger, written in the
 *    same transaction as the balance, under a row lock.
 *  • A billing-exempt company (the platform owner's own, 3U3) is never
 *    blocked or charged; its usage is still logged at $0 for reporting.
 */

export type UsageReason = 'SMS' | 'VOICE';
export type Charge = { ok: true; ledgerId: string | null; cents: number; fromAllowance: number } | { ok: false; why: 'NO_CREDITS' | 'DAILY_LIMIT' | 'MONTHLY_LIMIT' };

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function ensureWallet(tenantId: string, tx: Tx | typeof db = db) {
  await tx.insert(wallets).values({ tenantId }).onConflictDoNothing();
}

export async function getWallet(tenantId: string) {
  await ensureWallet(tenantId);
  return (await db.select().from(wallets).where(eq(wallets.tenantId, tenantId)).limit(1))[0]!;
}

async function lockWallet(tx: Tx, tenantId: string) {
  await ensureWallet(tenantId, tx);
  return (await tx.select().from(wallets).where(eq(wallets.tenantId, tenantId)).for('update'))[0]!;
}

async function billingExempt(tenantId: string) {
  const t = (await db.select({ exempt: tenants.billingExempt }).from(tenants).where(eq(tenants.id, tenantId)).limit(1))[0];
  return !!t?.exempt;
}

const startOfBusinessDay = () => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
};
const startOfMonth = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
};

async function usedSince(tenantId: string, reason: UsageReason, since: Date) {
  const r = await db
    .select({ n: sql<number>`coalesce(sum(${walletLedger.quantity}), 0)` })
    .from(walletLedger)
    .where(and(eq(walletLedger.tenantId, tenantId), eq(walletLedger.reason, reason), gte(walletLedger.createdAt, since), sql`${walletLedger.type} IN ('DEBIT','ALLOWANCE')`));
  return Number(r[0]?.n ?? 0);
}

/**
 * Pay for `quantity` units of usage (SMS segments or voice minutes). Uses
 * the plan allowance first, then credits. Returns what was charged, or why
 * it can't go ahead.
 */
export async function chargeUsage(tenantId: string, reason: UsageReason, quantity: number, ref?: string | null): Promise<Charge> {
  const qty = Math.max(1, Math.ceil(quantity));
  const unit = reason === 'SMS' ? USAGE.smsSegmentCents : USAGE.voiceMinuteCents;

  if (await billingExempt(tenantId)) {
    const id = crypto.randomUUID();
    await db.insert(walletLedger).values({ id, tenantId, type: 'ALLOWANCE', amountCents: 0, balanceAfterCents: 0, reason, quantity: qty, ref: ref ?? null, note: 'House account' });
    return { ok: true, ledgerId: id, cents: 0, fromAllowance: qty };
  }

  // Guardrails the platform owner controls (lib/billing/plans.ts GUARDRAILS).
  if (reason === 'SMS' && (await usedSince(tenantId, 'SMS', startOfBusinessDay())) + qty > GUARDRAILS.maxTextsPerDay) {
    return { ok: false, why: 'DAILY_LIMIT' };
  }
  if (reason === 'VOICE' && (await usedSince(tenantId, 'VOICE', startOfMonth())) + qty > GUARDRAILS.maxVoiceMinutesPerMonth) {
    return { ok: false, why: 'MONTHLY_LIMIT' };
  }

  return db.transaction(async (tx) => {
    const w = await lockWallet(tx, tenantId);
    const allowanceField = reason === 'SMS' ? 'includedTextsRemaining' : 'includedVoiceMinutesRemaining';
    const allowance = w[allowanceField];
    const fromAllowance = Math.min(allowance, qty);
    const paid = qty - fromAllowance;
    const cents = paid * unit;
    if (cents > w.balanceCents) return { ok: false as const, why: 'NO_CREDITS' as const };

    const balance = w.balanceCents - cents;
    await tx
      .update(wallets)
      .set({ balanceCents: balance, [allowanceField]: allowance - fromAllowance, updatedAt: new Date() })
      .where(eq(wallets.tenantId, tenantId));
    const id = crypto.randomUUID();
    if (fromAllowance > 0) {
      await tx.insert(walletLedger).values({ id: paid > 0 ? crypto.randomUUID() : id, tenantId, type: 'ALLOWANCE', amountCents: 0, balanceAfterCents: w.balanceCents, reason, quantity: fromAllowance, ref: ref ?? null, note: 'Included in plan' });
    }
    if (paid > 0) {
      await tx.insert(walletLedger).values({ id, tenantId, type: 'DEBIT', amountCents: -cents, balanceAfterCents: balance, reason, quantity: paid, ref: ref ?? null });
    }
    return { ok: true as const, ledgerId: id, cents, fromAllowance };
  }).then(async (r) => {
    if (r.ok) await afterDebit(tenantId).catch((err) => console.error('[wallet] after-debit follow-up failed', err));
    return r;
  });
}

/** Undo a charge whose provider call failed (money and allowance both go back). */
export async function refundCharge(tenantId: string, reason: UsageReason, charge: Charge, quantity: number, note = 'Provider call failed') {
  if (!charge.ok) return;
  const qty = Math.max(1, Math.ceil(quantity));
  if (await billingExempt(tenantId)) return;
  await db.transaction(async (tx) => {
    const w = await lockWallet(tx, tenantId);
    const allowanceField = reason === 'SMS' ? 'includedTextsRemaining' : 'includedVoiceMinutesRemaining';
    const balance = w.balanceCents + charge.cents;
    await tx
      .update(wallets)
      .set({ balanceCents: balance, [allowanceField]: w[allowanceField] + Math.min(charge.fromAllowance, qty), updatedAt: new Date() })
      .where(eq(wallets.tenantId, tenantId));
    await tx.insert(walletLedger).values({ tenantId, type: 'REFUND', amountCents: charge.cents, balanceAfterCents: balance, reason, quantity: qty, ref: charge.ledgerId, note });
  });
}

/** Charge, run the provider call, and refund if it throws or reports failure. */
export async function withUsage<T>(
  tenantId: string,
  reason: UsageReason,
  quantity: number,
  run: () => Promise<T>,
  succeeded: (result: T) => boolean = () => true,
): Promise<{ charged: true; result: T } | { charged: false; why: 'NO_CREDITS' | 'DAILY_LIMIT' | 'MONTHLY_LIMIT' }> {
  const charge = await chargeUsage(tenantId, reason, quantity);
  if (!charge.ok) return { charged: false, why: charge.why };
  try {
    const result = await run();
    if (!succeeded(result)) await refundCharge(tenantId, reason, charge, quantity);
    return { charged: true, result };
  } catch (err) {
    await refundCharge(tenantId, reason, charge, quantity);
    throw err;
  }
}

/** A fixed charge from the balance (the monthly phone number). */
export async function chargeFixed(tenantId: string, reason: 'PHONE_NUMBER', cents: number, ref: string): Promise<boolean> {
  if (await billingExempt(tenantId)) return true;
  return db.transaction(async (tx) => {
    const w = await lockWallet(tx, tenantId);
    if (w.balanceCents < cents) return false;
    const balance = w.balanceCents - cents;
    await tx.update(wallets).set({ balanceCents: balance, updatedAt: new Date() }).where(eq(wallets.tenantId, tenantId));
    await tx.insert(walletLedger).values({ tenantId, type: 'DEBIT', amountCents: -cents, balanceAfterCents: balance, reason, quantity: 1, ref });
    return true;
  });
}

/**
 * Add paid credits. `ref` is the Stripe PaymentIntent/Checkout id, so the
 * same payment can never be credited twice (unique index on TOPUP refs).
 */
export async function creditTopUp(tenantId: string, cents: number, ref: string): Promise<boolean> {
  if (cents <= 0) return false;
  try {
    return await db.transaction(async (tx) => {
      const w = await lockWallet(tx, tenantId);
      const balance = w.balanceCents + cents;
      await tx.insert(walletLedger).values({ tenantId, type: 'TOPUP', amountCents: cents, balanceAfterCents: balance, reason: 'TOPUP', quantity: 0, ref });
      await tx
        .update(wallets)
        .set({ balanceCents: balance, lowBalanceNotifiedAt: null, emptyNotifiedAt: null, updatedAt: new Date() })
        .where(eq(wallets.tenantId, tenantId));
      return true;
    });
  } catch (err) {
    // Unique violation on the ref: this payment was already credited.
    const e = err as { code?: string; cause?: { code?: string } };
    if (e.code === '23505' || e.cause?.code === '23505') return false;
    throw err;
  }
}

/** Platform-owner adjustment (goodwill credit or correction), always logged. */
export async function adjustBalance(tenantId: string, cents: number, note: string) {
  return db.transaction(async (tx) => {
    const w = await lockWallet(tx, tenantId);
    const balance = Math.max(0, w.balanceCents + cents);
    const applied = balance - w.balanceCents;
    await tx.update(wallets).set({ balanceCents: balance, updatedAt: new Date() }).where(eq(wallets.tenantId, tenantId));
    await tx.insert(walletLedger).values({ tenantId, type: 'ADJUSTMENT', amountCents: applied, balanceAfterCents: balance, reason: 'MANUAL', quantity: 0, note });
    return applied;
  });
}

/** Reset the plan's monthly allowance (on each paid renewal, or a plan change). Allowances don't roll over. */
export async function resetAllowance(tenantId: string, planKey: string) {
  const plan = planFor(planKey);
  await ensureWallet(tenantId);
  await db
    .update(wallets)
    .set({ includedTextsRemaining: plan.includedTexts, includedVoiceMinutesRemaining: plan.includedVoiceMinutes, allowanceResetAt: new Date(), updatedAt: new Date() })
    .where(eq(wallets.tenantId, tenantId));
}

export async function setAutoTopUp(tenantId: string, input: { enabled: boolean; thresholdCents?: number; amountCents?: number }) {
  await ensureWallet(tenantId);
  const amount = input.amountCents ?? USAGE.autoTopUpAmountCents;
  const threshold = input.thresholdCents ?? USAGE.autoTopUpThresholdCents;
  if (amount < 1000 || amount > 50000) throw new Error('Auto top-up must be between $10 and $500.');
  if (threshold < 0 || threshold > 10000) throw new Error('The top-up trigger must be between $0 and $100.');
  await db
    .update(wallets)
    .set({ autoTopUpEnabled: input.enabled, autoTopUpThresholdCents: threshold, autoTopUpAmountCents: amount, updatedAt: new Date() })
    .where(eq(wallets.tenantId, tenantId));
}

export async function ledgerFor(tenantId: string, limit = 50) {
  return db.select().from(walletLedger).where(eq(walletLedger.tenantId, tenantId)).orderBy(desc(walletLedger.createdAt)).limit(limit);
}

/** This month's usage, for Plan & credits. */
export async function usageThisMonth(tenantId: string) {
  const since = startOfMonth();
  const rows = await db
    .select({
      reason: walletLedger.reason,
      qty: sql<number>`coalesce(sum(case when ${walletLedger.type} in ('DEBIT','ALLOWANCE') then ${walletLedger.quantity} else 0 end), 0)`,
      spent: sql<number>`coalesce(sum(case when ${walletLedger.type} = 'DEBIT' then -${walletLedger.amountCents} when ${walletLedger.type} = 'REFUND' then -${walletLedger.amountCents} else 0 end), 0)`,
    })
    .from(walletLedger)
    .where(and(eq(walletLedger.tenantId, tenantId), gte(walletLedger.createdAt, since)))
    .groupBy(walletLedger.reason);
  const by = Object.fromEntries(rows.map((r) => [r.reason, { qty: Number(r.qty), spentCents: Number(r.spent) }]));
  return {
    texts: by.SMS ?? { qty: 0, spentCents: 0 },
    voiceMinutes: by.VOICE ?? { qty: 0, spentCents: 0 },
    number: by.PHONE_NUMBER ?? { qty: 0, spentCents: 0 },
  };
}

// ---- Tex phone calls, metered by the minute ------------------------------

/** On a new call: is there enough for Tex to answer? Reserves the first minutes. */
export async function startVoiceCall(tenantId: string, callSid: string): Promise<boolean> {
  const existing = (await db.select().from(voiceCalls).where(eq(voiceCalls.callSid, callSid)).limit(1))[0];
  if (existing) return true;
  const charge = await chargeUsage(tenantId, 'VOICE', USAGE.voiceMinMinutesToAnswer, callSid);
  if (!charge.ok) return false;
  await db.insert(voiceCalls).values({ callSid, tenantId, minutesCharged: USAGE.voiceMinMinutesToAnswer }).onConflictDoNothing();
  return true;
}

/**
 * On each turn of a call: charge any minutes the call has run past what's
 * already paid. False means the credits ran out — Tex wraps up the call.
 */
export async function continueVoiceCall(tenantId: string, callSid: string): Promise<boolean> {
  const call = (await db.select().from(voiceCalls).where(eq(voiceCalls.callSid, callSid)).limit(1))[0];
  if (!call) return startVoiceCall(tenantId, callSid);
  // Paid one minute ahead, so a reply never runs on unpaid time.
  const elapsed = Math.ceil((Date.now() - call.startedAt.getTime()) / 60000) + 1;
  const owed = elapsed - call.minutesCharged;
  if (owed <= 0) return true;
  const charge = await chargeUsage(tenantId, 'VOICE', owed, callSid);
  if (!charge.ok) return false;
  await db.update(voiceCalls).set({ minutesCharged: call.minutesCharged + owed }).where(eq(voiceCalls.callSid, callSid));
  return true;
}

// ---- Low balance, empty balance, auto top-up -----------------------------

async function afterDebit(tenantId: string) {
  const w = await getWallet(tenantId);
  if (w.autoTopUpEnabled && w.balanceCents < w.autoTopUpThresholdCents && w.defaultPaymentMethodId) {
    const { autoTopUp } = await import('@/lib/billing/stripeBilling');
    await autoTopUp(tenantId).catch((err) => console.error('[wallet] auto top-up failed', err));
    return;
  }
  const { notifyLowBalance } = await import('@/lib/billing/notices');
  if (w.balanceCents === 0 && !w.emptyNotifiedAt) {
    await db.update(wallets).set({ emptyNotifiedAt: new Date() }).where(eq(wallets.tenantId, tenantId));
    await notifyLowBalance(tenantId, 'EMPTY');
  } else if (w.balanceCents > 0 && w.balanceCents < USAGE.autoTopUpThresholdCents && !w.lowBalanceNotifiedAt) {
    await db.update(wallets).set({ lowBalanceNotifiedAt: new Date() }).where(eq(wallets.tenantId, tenantId));
    await notifyLowBalance(tenantId, 'LOW');
  }
}

/** What a company sees when texting is paused, by cause. */
export function usageBlockedMessage(why: 'NO_CREDITS' | 'DAILY_LIMIT' | 'MONTHLY_LIMIT') {
  if (why === 'NO_CREDITS') return 'Texting is paused — you’re out of credits. Add credits in Settings → Plan & credits and it starts again right away.';
  if (why === 'DAILY_LIMIT') return `You’ve reached today’s limit of ${GUARDRAILS.maxTextsPerDay.toLocaleString()} texts. Contact TRASHCAN support to raise it.`;
  return `Tex has reached this month’s limit of ${GUARDRAILS.maxVoiceMinutesPerMonth} phone minutes. Contact TRASHCAN support to raise it.`;
}

export { PLANS };

/** How many Tex/forwarded phone minutes the company can pay for right now (allowance + credits). */
export async function affordableVoiceMinutes(tenantId: string): Promise<number> {
  if (await billingExempt(tenantId)) return Number.POSITIVE_INFINITY;
  const w = await getWallet(tenantId);
  return w.includedVoiceMinutesRemaining + Math.floor(w.balanceCents / USAGE.voiceMinuteCents);
}

/** A <Dial> timeLimit (seconds) the company can cover, capped at an hour; null for a house account. */
export async function dialTimeLimit(tenantId: string): Promise<number | null> {
  const mins = await affordableVoiceMinutes(tenantId);
  if (!Number.isFinite(mins)) return null;
  return Math.max(60, Math.min(60, mins) * 60);
}
