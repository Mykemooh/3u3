import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { tenants, promoCodes, promoCodeRedemptions } from '@/db/schema';
import { getStripe } from '@/lib/stripe';
import { appUrl } from '@/lib/url';
import type Stripe from 'stripe';

export class PlatformError extends Error {}

export type Tenant = typeof tenants.$inferSelect;

/**
 * Whether this company's own access to the platform is currently in
 * good standing — enforced in app/admin/layout.tsx, never against the
 * platform tenant itself (isPlatform), which isn't a customer. A lapsed
 * trial or promo code, a canceled subscription, or a failed renewal all
 * read the same way here: accessExpiresAt in the past, or a planStatus
 * that was never given unlimited access to begin with.
 */
export function isPlatformAccessActive(tenant: Tenant): boolean {
  if (tenant.isPlatform) return true;
  if (tenant.planStatus === 'CANCELED' || tenant.planStatus === 'PAST_DUE') return false;
  if (!tenant.accessExpiresAt) return true;
  return tenant.accessExpiresAt.getTime() > Date.now();
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

  if (promo.tier === 'FOREVER') {
    await db.update(tenants).set({ planStatus: 'ACTIVE', accessExpiresAt: null }).where(eq(tenants.id, tenantId));
  } else {
    const days = promo.durationDays ?? DEFAULT_DURATION_DAYS[promo.tier] ?? 30;
    const base = tenant.accessExpiresAt && tenant.accessExpiresAt.getTime() > Date.now() ? tenant.accessExpiresAt.getTime() : Date.now();
    const accessExpiresAt = new Date(base + days * 24 * 60 * 60 * 1000);
    await db.update(tenants).set({ planStatus: 'TRIALING', accessExpiresAt }).where(eq(tenants.id, tenantId));
  }

  await db.insert(promoCodeRedemptions).values({ id: crypto.randomUUID(), promoCodeId: promo.id, tenantId });
  await db.update(promoCodes).set({ redemptionCount: promo.redemptionCount + 1 }).where(eq(promoCodes.id, promo.id));
}

// Placeholder pricing until real numbers are set — adjust this constant
// (and re-deploy) whenever the real price is decided; everything else
// here reads it, nothing else needs to change. Stripe's lookup_key makes
// re-running this idempotent: a cold start never creates a duplicate
// Product/Price, it just finds the one already made.
const PLACEHOLDER_MONTHLY_PRICE_CENTS = 9900;
const PRICE_LOOKUP_KEY = 'platform_pro_monthly_v1';

async function getOrCreatePlatformPrice(): Promise<string> {
  const stripe = getStripe();
  const existing = await stripe.prices.list({ lookup_keys: [PRICE_LOOKUP_KEY], active: true, limit: 1 });
  if (existing.data[0]) return existing.data[0].id;

  const product = await stripe.products.create({ name: '3U3 Platform — Pro', metadata: { platform: 'true' } });
  const price = await stripe.prices.create({
    product: product.id,
    currency: 'usd',
    unit_amount: PLACEHOLDER_MONTHLY_PRICE_CENTS,
    recurring: { interval: 'month' },
    lookup_key: PRICE_LOOKUP_KEY,
  });
  return price.id;
}

async function getOrCreatePlatformStripeCustomer(tenant: Tenant): Promise<string> {
  if (tenant.platformStripeCustomerId) return tenant.platformStripeCustomerId;
  const stripe = getStripe();
  const customer = await stripe.customers.create({ name: tenant.name, metadata: { tenantId: tenant.id, kind: 'PLATFORM' } });
  await db.update(tenants).set({ platformStripeCustomerId: customer.id }).where(eq(tenants.id, tenant.id));
  return customer.id;
}

/** Admin → Billing "Subscribe" — a real Stripe Checkout subscription for platform access (placeholder pricing; see PLACEHOLDER_MONTHLY_PRICE_CENTS above). */
export async function createPlatformCheckoutSession(tenantId: string): Promise<{ url: string }> {
  const tenant = (await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1))[0];
  if (!tenant) throw new PlatformError('Company not found.');

  const [priceId, customerId] = await Promise.all([getOrCreatePlatformPrice(), getOrCreatePlatformStripeCustomer(tenant)]);
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: { tenantId, kind: 'PLATFORM_SUBSCRIPTION' },
    success_url: appUrl('/admin/billing?subscribed=1'),
    cancel_url: appUrl('/admin/billing'),
  });
  if (!session.url) throw new PlatformError('Stripe did not return a checkout link.');
  return { url: session.url };
}

/** Stripe webhook: checkout.session.completed for a platform subscription. */
export async function confirmPlatformCheckout(session: Stripe.Checkout.Session) {
  if (session.metadata?.kind !== 'PLATFORM_SUBSCRIPTION' || !session.metadata.tenantId) return;
  await db
    .update(tenants)
    .set({ planStatus: 'ACTIVE', accessExpiresAt: null, platformStripeSubscriptionId: (session.subscription as string) ?? null })
    .where(eq(tenants.id, session.metadata.tenantId));
}

/** Stripe webhook: customer.subscription.updated/deleted — keeps plan status in sync with what's actually being paid. */
export async function syncPlatformSubscriptionStatus(subscription: Stripe.Subscription) {
  const tenant = (await db.select().from(tenants).where(eq(tenants.platformStripeSubscriptionId, subscription.id)).limit(1))[0];
  if (!tenant) return;

  if (subscription.status === 'active' || subscription.status === 'trialing') {
    await db.update(tenants).set({ planStatus: 'ACTIVE', accessExpiresAt: null }).where(eq(tenants.id, tenant.id));
  } else if (subscription.status === 'past_due' || subscription.status === 'unpaid') {
    await db.update(tenants).set({ planStatus: 'PAST_DUE' }).where(eq(tenants.id, tenant.id));
  } else if (subscription.status === 'canceled') {
    await db.update(tenants).set({ planStatus: 'CANCELED' }).where(eq(tenants.id, tenant.id));
  }
}
