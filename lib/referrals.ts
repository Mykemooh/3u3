import { randomInt } from 'node:crypto';
import { db } from '@/db/client';
import { users, tenants, notificationLog } from '@/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { appUrl } from '@/lib/url';
import { automationState, claimSend } from '@/lib/automations';

/**
 * Referrals. Every client has a short code and a link (/r/CODE). Someone
 * who requests a walkthrough through that link is recorded as referred by
 * them. When the referred client's first clean is finished — and only if
 * the company has turned on "Referral credit" — both get the company's
 * referral credit, which comes off their next invoice (lib/invoices.ts
 * applyClientCredit). Each referred client can trigger the reward once.
 */

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I

function newCode() {
  let code = '';
  for (let i = 0; i < 7; i += 1) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

export async function ensureReferralCode(userId: string) {
  const user = (await db.select({ code: users.referralCode }).from(users).where(eq(users.id, userId)).limit(1))[0];
  if (!user) return null;
  if (user.code) return user.code;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = newCode();
    try {
      const rows = await db
        .update(users)
        .set({ referralCode: code })
        .where(and(eq(users.id, userId), sql`${users.referralCode} is null`))
        .returning({ code: users.referralCode });
      if (rows.length) return rows[0].code;
      const again = (await db.select({ code: users.referralCode }).from(users).where(eq(users.id, userId)).limit(1))[0];
      if (again?.code) return again.code;
    } catch {
      // unique clash with another client's code — try another
    }
  }
  return null;
}

export const referralLink = (code: string) => appUrl(`/r/${code}`);

export async function referrerByCode(code: string | null | undefined, tenantId: string) {
  const clean = (code ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9]{5,12}$/.test(clean)) return null;
  const row = (await db.select().from(users).where(and(eq(users.referralCode, clean), eq(users.tenantId, tenantId))).limit(1))[0];
  return row ?? null;
}

/** Records who referred a brand-new client. Never overwrites, never self-referral. */
export async function recordReferral(clientId: string, code: string | null | undefined, tenantId: string) {
  const referrer = await referrerByCode(code, tenantId);
  if (!referrer || referrer.id === clientId) return false;
  const rows = await db
    .update(users)
    .set({ referredByUserId: referrer.id })
    .where(and(eq(users.id, clientId), sql`${users.referredByUserId} is null`))
    .returning({ id: users.id });
  return rows.length > 0;
}

/** Called when a clean is finished. Returns the credit granted to each side, or 0. */
export async function grantReferralReward(tenantId: string, clientId: string) {
  const client = (await db.select().from(users).where(eq(users.id, clientId)).limit(1))[0];
  if (!client?.referredByUserId) return 0;
  const tenant = (await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1))[0];
  if (!tenant || tenant.referralCreditCents <= 0) return 0;
  const state = await automationState(tenantId, 'referral_rewards');
  if (!state.enabled) return 0;
  const referrer = (await db.select().from(users).where(and(eq(users.id, client.referredByUserId), eq(users.tenantId, tenantId))).limit(1))[0];
  if (!referrer) return 0;
  if (!(await claimSend(tenantId, 'referral_reward', clientId))) return 0;
  const amount = tenant.referralCreditCents;
  await db.update(users).set({ creditCents: sql`${users.creditCents} + ${amount}` }).where(eq(users.id, clientId));
  if (referrer.isActive) await db.update(users).set({ creditCents: sql`${users.creditCents} + ${amount}` }).where(eq(users.id, referrer.id));
  await db.insert(notificationLog).values({
    id: crypto.randomUUID(),
    tenantId,
    channel: 'EMAIL',
    recipient: 'admin',
    triggerEvent: `REFERRAL_REWARD: ${referrer.name} referred ${client.name} — $${(amount / 100).toFixed(2)} credit each`,
    isRead: false,
  });
  return amount;
}

export async function referralStats(tenantId: string) {
  const rows = await db
    .select({ id: users.id, name: users.name, referredBy: users.referredByUserId, credit: users.creditCents, code: users.referralCode })
    .from(users)
    .where(and(eq(users.tenantId, tenantId), eq(users.role, 'CUSTOMER')));
  const referred = rows.filter((r) => r.referredBy);
  const counts = new Map<string, number>();
  for (const r of referred) counts.set(r.referredBy!, (counts.get(r.referredBy!) ?? 0) + 1);
  const top = Array.from(counts.entries())
    .map(([id, n]) => ({ id, name: rows.find((r) => r.id === id)?.name ?? 'Client', referrals: n }))
    .sort((a, b) => b.referrals - a.referrals)
    .slice(0, 5);
  return {
    referredClients: referred.length,
    outstandingCreditCents: rows.reduce((s, r) => s + r.credit, 0),
    top,
  };
}
