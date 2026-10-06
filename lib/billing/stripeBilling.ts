import type Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { tenants, wallets } from '@/db/schema';
import { getStripe, isStripeConfigured } from '@/lib/stripe';
import { appUrl } from '@/lib/url';
import { PLANS, USAGE, planFor, type PlanKey } from '@/lib/billing/plans';
import { creditTopUp, ensureWallet, getWallet, resetAllowance } from '@/lib/billing/wallet';
import { notifyCompanyAdmins, notifyPlatformOwners, companyName } from '@/lib/billing/notices';

/**
 * What a company pays TRASHCAN, on the platform's own Stripe account:
 * Crew/Team subscriptions, credit top-ups (manual and automatic) and the
 * one-time texting setup. Nothing here touches a company's own Stripe
 * account or its clients' money (that is lib/connect.ts).
 */

export class BillingError extends Error {
  status = 400;
}

const KIND = {
  plan: 'TC_PLAN',
  topup: 'TC_TOPUP',
  setup: 'TC_TEXTING_SETUP',
} as const;

async function tenantRow(tenantId: string) {
  const t = (await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1))[0];
  if (!t) throw new BillingError('Company not found.');
  return t;
}

function requireStripe() {
  if (!isStripeConfigured()) throw new BillingError('Payments aren’t set up on TRASHCAN yet. Try again soon.');
}

/** The company as a customer of TRASHCAN (one per company, reused for everything here). */
export async function platformCustomer(tenantId: string): Promise<string> {
  const t = await tenantRow(tenantId);
  if (t.platformStripeCustomerId) return t.platformStripeCustomerId;
  const customer = await getStripe().customers.create({ name: t.name, metadata: { tenantId, kind: 'PLATFORM' } });
  await db.update(tenants).set({ platformStripeCustomerId: customer.id }).where(eq(tenants.id, tenantId));
  return customer.id;
}

/** The Stripe price for a paid plan, created once and found by lookup key after that. */
async function priceFor(key: Exclude<PlanKey, 'FREE'>): Promise<string> {
  const plan = PLANS[key];
  const stripe = getStripe();
  const existing = await stripe.prices.list({ lookup_keys: [plan.lookupKey!], active: true, limit: 1 });
  if (existing.data[0]) return existing.data[0].id;
  const product = await stripe.products.create({ name: `TRASHCAN ${plan.name}`, metadata: { platform: 'true', plan: key } });
  const price = await stripe.prices.create({
    product: product.id,
    currency: 'usd',
    unit_amount: plan.monthlyCents,
    recurring: { interval: 'month' },
    lookup_key: plan.lookupKey!,
  });
  return price.id;
}

function planFromSubscription(sub: Stripe.Subscription): PlanKey | null {
  const lk = sub.items.data[0]?.price?.lookup_key;
  const found = (Object.keys(PLANS) as PlanKey[]).find((k) => PLANS[k].lookupKey && PLANS[k].lookupKey === lk);
  return found ?? ((sub.metadata?.plan as PlanKey) || null);
}

/**
 * Settings → Plan & credits → change plan. Paid → paid switches the live
 * subscription (prorated). To Free cancels at the end of the paid period.
 * From Free to a paid plan opens Stripe Checkout.
 */
export async function changePlan(tenantId: string, target: PlanKey): Promise<{ url?: string; message: string }> {
  const t = await tenantRow(tenantId);
  if (t.billingExempt) throw new BillingError('This company is a house account — it already has every feature with no platform fee.');
  if (!(target in PLANS)) throw new BillingError('Pick a plan.');
  requireStripe();
  const stripe = getStripe();

  const sub = t.platformStripeSubscriptionId ? await stripe.subscriptions.retrieve(t.platformStripeSubscriptionId).catch(() => null) : null;
  const live = sub && ['active', 'trialing', 'past_due'].includes(sub.status) ? sub : null;

  if (target === 'FREE') {
    if (!live) {
      await db.update(tenants).set({ plan: 'FREE' }).where(eq(tenants.id, tenantId));
      return { message: 'You’re on the Free plan.' };
    }
    await stripe.subscriptions.update(live.id, { cancel_at_period_end: true });
    const end = new Date(live.current_period_end * 1000);
    return { message: `You’ll move to Free on ${end.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}. Everything keeps working until then.` };
  }

  const price = await priceFor(target);
  if (live) {
    await stripe.subscriptions.update(live.id, {
      cancel_at_period_end: false,
      items: [{ id: live.items.data[0].id, price }],
      proration_behavior: 'create_prorations',
      metadata: { tenantId, plan: target },
    });
    await db.update(tenants).set({ plan: target, planStatus: 'ACTIVE' }).where(eq(tenants.id, tenantId));
    await resetAllowance(tenantId, target);
    return { message: `You’re on ${PLANS[target].name}. The difference is prorated on your next bill.` };
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: await platformCustomer(tenantId),
    line_items: [{ price, quantity: 1 }],
    subscription_data: { metadata: { tenantId, plan: target } },
    metadata: { tenantId, kind: KIND.plan, plan: target },
    success_url: appUrl('/admin/plan?plan=updated'),
    cancel_url: appUrl('/admin/plan'),
  });
  if (!session.url) throw new BillingError('Stripe didn’t return a checkout link.');
  return { url: session.url, message: 'Opening checkout…' };
}

/** Stripe's billing portal: update the card, see TRASHCAN invoices. */
export async function billingPortal(tenantId: string) {
  requireStripe();
  const session = await getStripe().billingPortal.sessions.create({ customer: await platformCustomer(tenantId), return_url: appUrl('/admin/plan') });
  return { url: session.url };
}

/** Add credits by card. The card is saved so auto top-up can use it. */
export async function startTopUp(tenantId: string, cents: number) {
  if (!(USAGE.topUpOptionsCents as readonly number[]).includes(cents)) throw new BillingError('Pick an amount.');
  requireStripe();
  await ensureWallet(tenantId);
  const session = await getStripe().checkout.sessions.create({
    mode: 'payment',
    customer: await platformCustomer(tenantId),
    line_items: [{ price_data: { currency: 'usd', unit_amount: cents, product_data: { name: 'TRASHCAN credits', description: 'Texts, Tex phone minutes and your business number' } }, quantity: 1 }],
    payment_intent_data: { setup_future_usage: 'off_session', metadata: { tenantId, kind: KIND.topup } },
    metadata: { tenantId, kind: KIND.topup },
    success_url: appUrl('/admin/plan?credits=added'),
    cancel_url: appUrl('/admin/plan'),
  });
  if (!session.url) throw new BillingError('Stripe didn’t return a checkout link.');
  return { url: session.url };
}

/** The one-time texting setup: business number + carrier registration. */
export async function startTextingSetup(tenantId: string) {
  requireStripe();
  const w = await getWallet(tenantId);
  if (w.textingStatus === 'REGISTERING' || w.textingStatus === 'ACTIVE') throw new BillingError('Texting is already set up (or being registered).');
  const session = await getStripe().checkout.sessions.create({
    mode: 'payment',
    customer: await platformCustomer(tenantId),
    line_items: [{ price_data: { currency: 'usd', unit_amount: USAGE.textingSetupCents, product_data: { name: 'TRASHCAN texting setup', description: 'Business number and US carrier (A2P 10DLC) registration' } }, quantity: 1 }],
    payment_intent_data: { setup_future_usage: 'off_session', metadata: { tenantId, kind: KIND.setup } },
    metadata: { tenantId, kind: KIND.setup },
    success_url: appUrl('/admin/plan?texting=paid'),
    cancel_url: appUrl('/admin/plan'),
  });
  await db.update(wallets).set({ textingStatus: 'PENDING_PAYMENT', updatedAt: new Date() }).where(eq(wallets.tenantId, tenantId));
  if (!session.url) throw new BillingError('Stripe didn’t return a checkout link.');
  return { url: session.url };
}

/**
 * Off-session top-up with the saved card. One attempt per company per
 * ten minutes (Stripe idempotency key), so a burst of texts can't trigger
 * several charges. Credits land when the webhook confirms the payment.
 */
export async function autoTopUp(tenantId: string) {
  if (!isStripeConfigured()) return;
  const w = await getWallet(tenantId);
  if (!w.autoTopUpEnabled || !w.defaultPaymentMethodId) return;
  const window = Math.floor(Date.now() / 600000);
  await getStripe().paymentIntents.create(
    {
      amount: w.autoTopUpAmountCents,
      currency: 'usd',
      customer: await platformCustomer(tenantId),
      payment_method: w.defaultPaymentMethodId,
      off_session: true,
      confirm: true,
      description: 'TRASHCAN credits (auto top-up)',
      metadata: { tenantId, kind: KIND.topup, auto: '1' },
    },
    { idempotencyKey: `tc-auto-topup-${tenantId}-${window}` },
  ).catch(async (err) => {
    await disableAutoTopUp(tenantId, (err as Error).message);
  });
}

async function disableAutoTopUp(tenantId: string, why: string) {
  await db.update(wallets).set({ autoTopUpEnabled: false, updatedAt: new Date() }).where(eq(wallets.tenantId, tenantId));
  await notifyCompanyAdmins(
    tenantId,
    'AUTO_TOPUP_FAILED',
    'Auto top-up didn’t go through',
    `We couldn’t charge your saved card for TRASHCAN credits (${why}), so auto top-up is off. Add credits by hand or update your card to turn it back on.`,
    { label: 'Open Plan & credits', path: '/admin/plan' },
  );
}

async function savePaymentMethod(tenantId: string, pi: Stripe.PaymentIntent) {
  const pmId = typeof pi.payment_method === 'string' ? pi.payment_method : pi.payment_method?.id;
  if (!pmId) return;
  const pm = await getStripe().paymentMethods.retrieve(pmId).catch(() => null);
  await db
    .update(wallets)
    .set({ defaultPaymentMethodId: pmId, cardBrand: pm?.card?.brand ?? null, cardLast4: pm?.card?.last4 ?? null, updatedAt: new Date() })
    .where(eq(wallets.tenantId, tenantId));
}

/**
 * Stripe webhook events for TRASHCAN's own billing. Returns true when the
 * event was one of ours. Safe to receive twice: credits are keyed on the
 * PaymentIntent id and plan changes are idempotent writes.
 */
export async function handleBillingEvent(event: Stripe.Event): Promise<boolean> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const s = event.data.object as Stripe.Checkout.Session;
      const tenantId = s.metadata?.tenantId;
      if (!tenantId) return false;
      if (s.metadata?.kind === KIND.plan) {
        const plan = planFor(s.metadata.plan).key;
        await db
          .update(tenants)
          .set({ plan, planStatus: 'ACTIVE', accessExpiresAt: null, platformStripeSubscriptionId: (s.subscription as string) ?? null })
          .where(eq(tenants.id, tenantId));
        await resetAllowance(tenantId, plan);
        return true;
      }
      if (s.metadata?.kind === KIND.setup) {
        await ensureWallet(tenantId);
        const paidThrough = new Date();
        paidThrough.setUTCMonth(paidThrough.getUTCMonth() + 1);
        await db.update(wallets).set({ textingStatus: 'REGISTERING', numberPaidThrough: paidThrough, updatedAt: new Date() }).where(eq(wallets.tenantId, tenantId));
        const name = await companyName(tenantId);
        await notifyPlatformOwners(
          `Texting setup paid: ${name}`,
          `${name} paid the texting setup. Buy their business number in Twilio, file the A2P 10DLC brand and campaign, then add the number to the company on the platform (Companies → ${name}). Their status shows “Registering” until then.`,
        );
        await notifyCompanyAdmins(tenantId, 'TEXTING_REGISTERING', 'Your business number is on its way', 'Thanks — we’re setting up your business number and registering it with US carriers. That usually takes a few business days. Client messages go by email until it’s ready; we’ll tell you the moment texting is live.');
        return true;
      }
      return s.metadata?.kind === KIND.topup;
    }
    case 'payment_intent.succeeded': {
      const pi = event.data.object as Stripe.PaymentIntent;
      if (pi.metadata?.kind !== KIND.topup || !pi.metadata.tenantId) return pi.metadata?.kind === KIND.setup;
      await creditTopUp(pi.metadata.tenantId, pi.amount_received || pi.amount, pi.id);
      const { resumeSuspendedNumber } = await import('@/lib/billing/daily');
      await resumeSuspendedNumber(pi.metadata.tenantId).catch(() => false);
      await savePaymentMethod(pi.metadata.tenantId, pi).catch((err) => console.error('[billing] could not save card', err));
      return true;
    }
    case 'payment_intent.payment_failed': {
      const pi = event.data.object as Stripe.PaymentIntent;
      if (pi.metadata?.kind !== KIND.topup || !pi.metadata.tenantId) return false;
      if (pi.metadata.auto === '1') await disableAutoTopUp(pi.metadata.tenantId, pi.last_payment_error?.message ?? 'card declined');
      return true;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      const tenantId = sub.metadata?.tenantId;
      const t = tenantId
        ? (await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1))[0]
        : (await db.select().from(tenants).where(eq(tenants.platformStripeSubscriptionId, sub.id)).limit(1))[0];
      if (!t) return false;
      if (event.type === 'customer.subscription.deleted' || sub.status === 'canceled' || sub.status === 'incomplete_expired' || sub.status === 'unpaid') {
        // Never a lock-out: a lapsed or cancelled plan is simply Free.
        await db.update(tenants).set({ plan: 'FREE', planStatus: 'ACTIVE', platformStripeSubscriptionId: null }).where(eq(tenants.id, t.id));
        await resetAllowance(t.id, 'FREE');
        if (t.plan !== 'FREE') {
          await notifyCompanyAdmins(t.id, 'PLAN_ENDED', 'You’re on the Free plan now', `Your ${planFor(t.plan).name} plan has ended. Nothing is locked — everything keeps working, and the Free plan’s 1% fee applies to card payments. You can switch back any time.`, { label: 'Plan & credits', path: '/admin/plan' });
        }
        return true;
      }
      if (sub.status === 'past_due') {
        await db.update(tenants).set({ planStatus: 'PAST_DUE' }).where(eq(tenants.id, t.id));
        return true;
      }
      if (sub.status === 'active' || sub.status === 'trialing') {
        const plan = planFromSubscription(sub) ?? planFor(t.plan).key;
        const changed = plan !== t.plan;
        await db.update(tenants).set({ plan, planStatus: 'ACTIVE', platformStripeSubscriptionId: sub.id }).where(eq(tenants.id, t.id));
        if (changed) await resetAllowance(t.id, plan);
      }
      return true;
    }
    case 'invoice.paid': {
      const inv = event.data.object as Stripe.Invoice;
      const subId = typeof inv.subscription === 'string' ? inv.subscription : inv.subscription?.id;
      if (!subId) return false;
      const t = (await db.select().from(tenants).where(eq(tenants.platformStripeSubscriptionId, subId)).limit(1))[0];
      if (!t) return false;
      if (inv.billing_reason === 'subscription_cycle') await resetAllowance(t.id, t.plan);
      return true;
    }
    default:
      return false;
  }
}
