import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { tenants, promoCodes, promoCodeRedemptions } from '@/db/schema';

export class PlatformError extends Error {}

export type Tenant = typeof tenants.$inferSelect;

/**
 * Kept for older callers: under the plan model (lib/billing/plans.ts) a
 * company's own tools are never locked — a lapsed subscription is simply
 * the Free plan. Always true.
 */
export function isPlatformAccessActive(_tenant: Tenant): boolean {
  return true;
}

const DEFAULT_DURATION_DAYS: Record<'TRIAL_1MO' | 'TRIAL_3MO' | 'FOREVER', number | null> = {
  TRIAL_1MO: 30,
  TRIAL_3MO: 90,
  FOREVER: null,
};

export async function createPromoCode(input: {
  code: string;
  tier: 'TRIAL_1MO' | 'TRIAL_3MO' | 'FOREVER';
  maxRedemptions?: number | null;
  createdByUserId: string;
}): Promise<string> {
  const code = input.code.trim().toUpperCase();
  if (!code) throw new PlatformError('A code is required.');
  const existing = (await db.select().from(promoCodes).where(eq(promoCodes.code, code)).limit(1))[0];
  if (existing) throw new PlatformError(`"${code}" already exists.`);

  const id = crypto.randomUUID();
  await db.insert(promoCodes).values({
    id,
    code,
    tier: input.tier,
    durationDays: DEFAULT_DURATION_DAYS[input.tier],
    maxRedemptions: input.maxRedemptions ?? null,
    createdByUserId: input.createdByUserId,
  });
  return id;
}

export async function setPromoCodeActive(id: string, active: boolean): Promise<void> {
  await db.update(promoCodes).set({ active }).where(eq(promoCodes.id, id));
}

export async function listPromoCodes() {
  return db.select().from(promoCodes).orderBy(promoCodes.createdAt);
}

/**
 * A tenant admin redeeming a code from Admin → Billing. Extends from
 * whichever is later — now, or the tenant's current accessExpiresAt —
 * so redeeming a second code stacks remaining time instead of losing it.
 * FOREVER sets accessExpiresAt to null (never gated again) and can't
 * later be "shortened" by a different code, by design — it's permanent.
 */
export async function redeemPromoCode(tenantId: string, codeInput: string): Promise<void> {
  const code = codeInput.trim().toUpperCase();
  const promo = (await db.select().from(promoCodes).where(eq(promoCodes.code, code)).limit(1))[0];
  if (!promo || !promo.active) throw new PlatformError('That code is not valid.');
  if (promo.maxRedemptions != null && promo.redemptionCount >= promo.maxRedemptions) {
    throw new PlatformError('That code has already reached its redemption limit.');
  }
  const already = (
    await db.select().from(promoCodeRedemptions).where(and(eq(promoCodeRedemptions.promoCodeId, promo.id), eq(promoCodeRedemptions.tenantId, tenantId))).limit(1)
  )[0];
  if (already) throw new PlatformError('Your company has already redeemed this code.');

  const tenant = (await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1))[0];
  if (!tenant) throw new PlatformError('Company not found.');

  // A code is a complimentary Team plan: for a while, or for good.
  if (promo.tier === 'FOREVER') {
    await db.update(tenants).set({ planCompForever: true, planCompUntil: null }).where(eq(tenants.id, tenantId));
  } else {
    const days = promo.durationDays ?? DEFAULT_DURATION_DAYS[promo.tier] ?? 30;
    const current = tenant.planCompUntil && tenant.planCompUntil.getTime() > Date.now() ? tenant.planCompUntil.getTime() : Date.now();
    const planCompUntil = new Date(current + days * 24 * 60 * 60 * 1000);
    await db.update(tenants).set({ planCompUntil }).where(eq(tenants.id, tenantId));
  }
  const { resetAllowance } = await import('@/lib/billing/wallet');
  await resetAllowance(tenantId, 'TEAM');

  await db.insert(promoCodeRedemptions).values({ id: crypto.randomUUID(), promoCodeId: promo.id, tenantId });
  await db.update(promoCodes).set({ redemptionCount: promo.redemptionCount + 1 }).where(eq(promoCodes.id, promo.id));
}

// Subscriptions, credits and the texting setup now live in
// lib/billing/stripeBilling.ts (the plan model, docs/billing.md).
