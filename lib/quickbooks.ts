import { randomBytes } from 'crypto';
import { eq, and } from 'drizzle-orm';
import { db } from '@/db/client';
import { integrations, quickbooksLinks, users } from '@/db/schema';
import { getInvoiceWithItems } from '@/lib/invoices';
import { appUrl } from '@/lib/url';

export class QuickbooksError extends Error {}

/**
 * QuickBooks Online accounting sync — foundation, not yet exercised
 * against a live company file in this environment (no sandbox
 * credentials to test against here). The OAuth plumbing and the API
 * calls below follow Intuit's documented v3 Accounting API exactly, and
 * every write is idempotent (quickbooks_links remembers what's already
 * been pushed), the same way Stripe/Twilio in this app degrade: nothing
 * calls out unless an admin has connected QuickBooks, and
 * confirmInvoicePaid() in lib/invoices.ts treats a push failure as a
 * warning, never something that blocks a payment from being recorded in
 * our own database.
 *
 * Needs, once an admin registers a free Intuit developer app
 * (developer.intuit.com) and connects it from Admin → Integrations:
 *   QUICKBOOKS_CLIENT_ID, QUICKBOOKS_CLIENT_SECRET,
 *   QUICKBOOKS_ENVIRONMENT ("sandbox" while testing, "production" to go
 *   live) — all free from Intuit; QuickBooks Online itself is the
 *   tenant's own subscription, same as Stripe's processing fees are the
 *   tenant's, not an app cost.
 */

const CLIENT_ID = process.env.QUICKBOOKS_CLIENT_ID;
const CLIENT_SECRET = process.env.QUICKBOOKS_CLIENT_SECRET;
const ENVIRONMENT = process.env.QUICKBOOKS_ENVIRONMENT === 'production' ? 'production' : 'sandbox';

export function quickbooksConfigured(): boolean {
  return !!(CLIENT_ID && CLIENT_SECRET);
}

function redirectUri(): string {
  return appUrl('/api/admin/integrations/quickbooks/callback');
}

function apiBase(): string {
  return ENVIRONMENT === 'production' ? 'https://quickbooks.api.intuit.com' : 'https://sandbox-quickbooks.api.intuit.com';
}

/** Where "Connect QuickBooks" sends the admin — Intuit's own consent screen. */
export function authorizeUrl(state: string): string {
  if (!CLIENT_ID) throw new QuickbooksError('QUICKBOOKS_CLIENT_ID is not set');
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    scope: 'com.intuit.quickbooks.accounting',
    redirect_uri: redirectUri(),
    state,
  });
  return `https://appcenter.intuit.com/connect/oauth2?${params.toString()}`;
}

export function newState(): string {
  return randomBytes(16).toString('hex');
}

async function tokenRequest(body: Record<string, string>) {
  if (!CLIENT_ID || !CLIENT_SECRET) throw new QuickbooksError('QuickBooks is not configured');
  const res = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams(body),
  });
  if (!res.ok) throw new QuickbooksError(`QuickBooks token request failed: ${await res.text()}`);
  return res.json() as Promise<{ access_token: string; refresh_token: string; expires_in: number }>;
}

/** Exchanges the code Intuit's redirect carried for tokens, and stores them. */
export async function connectQuickbooks(tenantId: string, code: string, realmId: string): Promise<void> {
  const tokens = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri() });
  const existing = (
    await db.select().from(integrations).where(and(eq(integrations.tenantId, tenantId), eq(integrations.provider, 'QUICKBOOKS'))).limit(1)
  )[0];
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
  if (existing) {
    await db
      .update(integrations)
      .set({ accessToken: tokens.access_token, refreshToken: tokens.refresh_token, externalAccountId: realmId, expiresAt })
      .where(eq(integrations.id, existing.id));
  } else {
    await db.insert(integrations).values({
      id: crypto.randomUUID(),
      tenantId,
      provider: 'QUICKBOOKS',
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      externalAccountId: realmId,
      expiresAt,
    });
  }
}

export async function disconnectQuickbooks(tenantId: string): Promise<void> {
  await db.delete(integrations).where(and(eq(integrations.tenantId, tenantId), eq(integrations.provider, 'QUICKBOOKS')));
}

export async function quickbooksConnection(tenantId: string) {
  return (
    await db.select().from(integrations).where(and(eq(integrations.tenantId, tenantId), eq(integrations.provider, 'QUICKBOOKS'))).limit(1)
  )[0];
}

/** A valid (refreshed if needed) access token + which company file it's for. */
async function getAccessToken(tenantId: string): Promise<{ accessToken: string; realmId: string } | null> {
  const conn = await quickbooksConnection(tenantId);
  if (!conn || !conn.externalAccountId) return null;

  if (!conn.expiresAt || conn.expiresAt.getTime() > Date.now() + 60_000) {
    return { accessToken: conn.accessToken, realmId: conn.externalAccountId };
  }

  const tokens = await tokenRequest({ grant_type: 'refresh_token', refresh_token: conn.refreshToken });
  await db
    .update(integrations)
    .set({ accessToken: tokens.access_token, refreshToken: tokens.refresh_token, expiresAt: new Date(Date.now() + tokens.expires_in * 1000) })
    .where(eq(integrations.id, conn.id));
  return { accessToken: tokens.access_token, realmId: conn.externalAccountId };
}

async function qbFetch(tenantId: string, path: string, init?: RequestInit) {
  const auth = await getAccessToken(tenantId);
  if (!auth) throw new QuickbooksError('QuickBooks is not connected');
  const res = await fetch(`${apiBase()}/v3/company/${auth.realmId}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  if (!res.ok) throw new QuickbooksError(`QuickBooks API error (${res.status}): ${await res.text()}`);
  return res.json();
}

async function linkFor(tenantId: string, entity: 'CUSTOMER' | 'INVOICE', localId: string): Promise<string | null> {
  const row = (
    await db
      .select()
      .from(quickbooksLinks)
      .where(and(eq(quickbooksLinks.tenantId, tenantId), eq(quickbooksLinks.entity, entity), eq(quickbooksLinks.localId, localId)))
      .limit(1)
  )[0];
  return row?.quickbooksId ?? null;
}

async function saveLink(tenantId: string, entity: 'CUSTOMER' | 'INVOICE', localId: string, quickbooksId: string) {
  await db.insert(quickbooksLinks).values({ id: crypto.randomUUID(), tenantId, entity, localId, quickbooksId });
}

async function findOrCreateQbCustomer(tenantId: string, client: typeof users.$inferSelect): Promise<string> {
  const existing = await linkFor(tenantId, 'CUSTOMER', client.id);
  if (existing) return existing;

  const created = await qbFetch(tenantId, '/customer?minorversion=65', {
    method: 'POST',
    body: JSON.stringify({
      DisplayName: `${client.name} (3U3 #${client.id.slice(0, 8)})`,
      PrimaryEmailAddr: client.email ? { Address: client.email } : undefined,
      PrimaryPhone: client.phone ? { FreeFormNumber: client.phone } : undefined,
    }),
  });
  const qbId = created.Customer.Id as string;
  await saveLink(tenantId, 'CUSTOMER', client.id, qbId);
  return qbId;
}

/**
 * Pushes a just-paid invoice as a QuickBooks SalesReceipt — "money
 * already received", which is what a paid 3U3 invoice actually is,
 * rather than an Invoice (outstanding receivable) that would then need a
 * separate Payment applied against it.
 */
export async function pushPaidInvoice(tenantId: string, invoiceId: string): Promise<void> {
  if (!quickbooksConfigured()) return;
  const conn = await quickbooksConnection(tenantId);
  if (!conn) return; // not connected — nothing to do, not an error

  if (await linkFor(tenantId, 'INVOICE', invoiceId)) return; // already pushed

  const data = await getInvoiceWithItems(invoiceId);
  if (!data || !data.client) return;
  const { invoice, lines: billable, client } = data;

  const qbCustomerId = await findOrCreateQbCustomer(tenantId, client);
  // A paid tip is also an isTip line item (lib/tips.ts); it's added once below, from tipCents.
  const lines = billable.map((item) => ({
    Amount: item.amountCents / 100,
    DetailType: 'SalesItemLineDetail',
    Description: item.description,
    SalesItemLineDetail: { ItemRef: { name: 'Services', value: '1' } },
  }));
  if (invoice.tipCents > 0) {
    lines.push({
      Amount: invoice.tipCents / 100,
      DetailType: 'SalesItemLineDetail',
      Description: 'Tip',
      SalesItemLineDetail: { ItemRef: { name: 'Services', value: '1' } },
    });
  }

  const created = await qbFetch(tenantId, '/salesreceipt?minorversion=65', {
    method: 'POST',
    body: JSON.stringify({ CustomerRef: { value: qbCustomerId }, Line: lines }),
  });
  await saveLink(tenantId, 'INVOICE', invoiceId, created.SalesReceipt.Id as string);
}
