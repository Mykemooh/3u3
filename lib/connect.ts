import type Stripe from 'stripe';
import { db } from '@/db/client';
import { tenants } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getStripe, isStripeConfigured } from '@/lib/stripe';
import { appUrl } from '@/lib/url';

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

/** Extra Stripe parameters that route a charge to the company's own account, or nothing. */
export async function connectRouting(tenantId: string): Promise<{ destination: string } | null> {
  const tenant = (await db.select({ id: tenants.stripeConnectAccountId, ready: tenants.stripeConnectReady }).from(tenants).where(eq(tenants.id, tenantId)).limit(1))[0];
  return tenant?.id && tenant.ready ? { destination: tenant.id } : null;
}

export async function connectDashboardLink(tenantId: string) {
  const tenant = (await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1))[0];
  if (!tenant?.stripeConnectAccountId) throw new ConnectError('Not connected.');
  const link = await getStripe().accounts.createLoginLink(tenant.stripeConnectAccountId);
  return { url: link.url };
}
