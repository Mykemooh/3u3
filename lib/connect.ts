import type Stripe from 'stripe';
import { db } from '@/db/client';
import { tenants } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getStripe, isStripeConfigured } from '@/lib/stripe';
import { appUrl } from '@/lib/url';
import { planFor, platformFeeOnly, stripePassthrough, effectivePlanKey } from '@/lib/billing/plans';

/**
 * Stripe Connect: a cleaning company's own Stripe account, so its clients'
 * payments land in its bank, not the platform's. Express accounts — Stripe
 * runs the identity and bank-account onboarding on its own pages.
 *
 * Until a company connects (or while its account isn't fully enabled),
 * payments keep working exactly as before, on the platform's own Stripe
 * account. Once ready, invoices, monthly statements and tips are created
 * as destination charges (transfer_data + on_behalf_of): the client still
 * pays on the same pages, and the money is routed to the company.
 */

export class ConnectError extends Error {
  status = 400;
}

export async function startConnectOnboarding(tenantId: string) {
  if (!isStripeConfigured()) throw new ConnectError('Stripe isn’t set up on this platform yet.');
  const tenant = (await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1))[0];
  if (!tenant) throw new ConnectError('Company not found.');
  const stripe = getStripe();
  let accountId = tenant.stripeConnectAccountId;
  if (!accountId) {
    const account = await stripe.accounts.create({
      type: 'express',
      country: 'US',
      business_profile: { name: tenant.name, mcc: '7349' }, // 7349: cleaning and maintenance services
      capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      metadata: { tenantId },
    });
    accountId = account.id;
    await db.update(tenants).set({ stripeConnectAccountId: accountId, stripeConnectReady: false }).where(eq(tenants.id, tenantId));
  }
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: appUrl('/admin/settings?connect=refresh#payments'),
    return_url: appUrl('/admin/settings?connect=return#payments'),
    type: 'account_onboarding',
  });
  return { url: link.url };
}

const readyFrom = (a: Stripe.Account) => !!a.charges_enabled && !!a.payouts_enabled;

/** Re-reads the account from Stripe (after onboarding returns, or from the account.updated webhook). */
export async function refreshConnectStatus(tenantId: string) {
  const tenant = (await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1))[0];
  if (!tenant?.stripeConnectAccountId || !isStripeConfigured()) return { connected: false, ready: false };
  const account = await getStripe().accounts.retrieve(tenant.stripeConnectAccountId);
  const ready = readyFrom(account);
  if (ready !== tenant.stripeConnectReady) await db.update(tenants).set({ stripeConnectReady: ready }).where(eq(tenants.id, tenantId));
  return { connected: true, ready, needs: account.requirements?.currently_due?.length ?? 0 };
}

/** Stripe webhook: account.updated. */
export async function syncConnectAccount(account: Stripe.Account) {
  const tenant = (await db.select().from(tenants).where(eq(tenants.stripeConnectAccountId, account.id)).limit(1))[0];
  if (!tenant) return;
  await db.update(tenants).set({ stripeConnectReady: readyFrom(account) }).where(eq(tenants.id, tenant.id));
}

/**
 * Where a charge goes: the company's own account if it is connected and
 * Stripe says it can take charges right now (checked live, so a restricted
 * account never receives a charge it can't accept), otherwise the
 * platform's account as before connecting. Returns the destination and
 * the platform's application fee for this amount (lib/billing/plans.ts).
 *
 * `kind: 'TIP'` is a tip for the crew: TrashCan takes no platform fee on
 * it, only Stripe's own cost of moving it.
 */
export async function connectRouting(
  tenantId: string,
  amountCents: number,
  kind: 'PAYMENT' | 'TIP' = 'PAYMENT',
): Promise<{ destination: string; feeCents: number } | null> {
  const tenant = (
    await db
      .select({
        id: tenants.stripeConnectAccountId,
        ready: tenants.stripeConnectReady,
        plan: tenants.plan,
        planCompUntil: tenants.planCompUntil,
        planCompForever: tenants.planCompForever,
        exempt: tenants.billingExempt,
      })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1)
  )[0];
  if (!tenant?.id || !tenant.ready) return null;
  try {
    const account = await getStripe().accounts.retrieve(tenant.id);
    if (!readyFrom(account)) {
      await db.update(tenants).set({ stripeConnectReady: false }).where(eq(tenants.id, tenantId));
      return null;
    }
  } catch (err) {
    console.error('[connect] could not check account', err);
    return null;
  }
  return {
    destination: tenant.id,
    feeCents: applicationFeeCents(amountCents, { plan: effectivePlanKey({ ...tenant, billingExempt: tenant.exempt }), exempt: tenant.exempt, kind }),
  };
}

/**
 * Like connectRouting, but refuses to put another company's client payment
 * into the platform's own Stripe account. Only a billing-exempt house
 * account (the platform owner's own company) may take card payments before
 * connecting; everyone else is asked to connect Stripe first.
 */
export async function cardRouting(tenantId: string, amountCents: number, kind: 'PAYMENT' | 'TIP' = 'PAYMENT') {
  const routing = await connectRouting(tenantId, amountCents, kind);
  if (routing) return routing;
  const t = (await db.select({ exempt: tenants.billingExempt, isPlatform: tenants.isPlatform }).from(tenants).where(eq(tenants.id, tenantId)).limit(1))[0];
  if (t?.exempt) return null;
  throw new ConnectError('Connect your Stripe account (Settings → Payments) before taking card payments, so clients pay your business directly.');
}

/**
 * The platform's application fee on a payment routed to a company's
 * account: Stripe's own cost of the destination charge (which Stripe bills
 * the platform for), plus the plan's platform fee. A billing-exempt company
 * pays only the pass-through; a tip never carries the platform fee.
 */
export function applicationFeeCents(
  amountCents: number,
  opts: { plan?: string | null; exempt?: boolean; kind?: 'PAYMENT' | 'TIP' } = {},
) {
  if (amountCents <= 0) return 0;
  const pass = stripePassthrough();
  const passthrough = Math.round((amountCents * pass.bps) / 10000) + pass.fixedCents;
  const plan = planFor(opts.plan);
  const platform = opts.kind === 'TIP' ? 0 : platformFeeOnly(plan, amountCents, !!opts.exempt);
  return Math.min(amountCents, Math.max(0, passthrough + platform));
}

/** @deprecated kept for older callers — the Free plan's fee on a plain payment. */
export function platformFeeCents(amountCents: number) {
  return applicationFeeCents(amountCents);
}

export async function connectDashboardLink(tenantId: string) {
  const tenant = (await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1))[0];
  if (!tenant?.stripeConnectAccountId) throw new ConnectError('Not connected.');
  const link = await getStripe().accounts.createLoginLink(tenant.stripeConnectAccountId);
  return { url: link.url };
}
