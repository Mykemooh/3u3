import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { users, xeroLinks } from '@/db/schema';
import { getInvoiceWithItems } from '@/lib/invoices';
import { appUrl } from '@/lib/url';
import { type Actor } from '@/lib/audit';
import { freshAccessToken, getConnection, saveConnection, type TokenSet } from '@/lib/companyConnections';

/**
 * Xero accounting sync — the QuickBooks sync's twin (lib/quickbooks.ts)
 * for companies on Xero.
 *
 * When an invoice is paid, it's added to Xero as a "receive money" bank
 * transaction — money already received, the same thing QuickBooks gets
 * as a sales receipt — against the client's contact (made the first time),
 * with each line item and any tip. xero_links remembers what's been sent,
 * and the request carries an Idempotency-Key, so nothing is added twice.
 *
 * Needs XERO_CLIENT_ID and XERO_CLIENT_SECRET (a free app at
 * developer.xero.com, redirect <site>/api/admin/integrations/xero/callback);
 * then each company clicks Connect Xero. Optional:
 *   XERO_SCOPES — override the requested scopes (newer Xero apps may need
 *     Xero's granular scopes instead of accounting.transactions),
 *   XERO_SALES_ACCOUNT_CODE — revenue account for line items (default
 *     "200", Sales in Xero's default chart),
 *   XERO_BANK_ACCOUNT_CODE — which bank account receives the money
 *     (default: the only bank account, or the first one named "Stripe").
 *
 * A failed push never blocks recording a payment here (lib/invoices.ts).
 */

export class XeroError extends Error {}

export const xeroConfigured = () => !!(process.env.XERO_CLIENT_ID?.trim() && process.env.XERO_CLIENT_SECRET?.trim());
const redirectUri = () => appUrl('/api/admin/integrations/xero/callback');
const scopes = () => process.env.XERO_SCOPES?.trim() || 'openid profile email offline_access accounting.transactions accounting.contacts accounting.settings.read';

export function xeroAuthorizeUrl(state: string) {
  const params = new URLSearchParams({ response_type: 'code', client_id: process.env.XERO_CLIENT_ID ?? '', redirect_uri: redirectUri(), scope: scopes(), state });
  return `https://login.xero.com/identity/connect/authorize?${params}`;
}

async function tokenRequest(body: Record<string, string>): Promise<TokenSet> {
  const basic = Buffer.from(`${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`).toString('base64');
  const res = await fetch('https://identity.xero.com/connect/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(10000),
  });
  const data = (await res.json().catch(() => ({}))) as TokenSet;
  if (!res.ok || !data.access_token) throw new XeroError(`Xero sign-in failed (${res.status})`);
  return data;
}

export async function connectXero(tenantId: string, code: string, actor: Actor) {
  const tokens = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri() });
  const res = await fetch('https://api.xero.com/connections', { headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
  const orgs = ((await res.json().catch(() => [])) as { tenantId: string; tenantType: string }[]).filter((c) => c.tenantType === 'ORGANISATION');
  if (!res.ok || !orgs.length) throw new XeroError('That Xero sign-in has no organisation connected.');
  await saveConnection(tenantId, 'XERO', tokens, orgs[0].tenantId, actor, 'Xero');
}

async function xero(tenantId: string, method: string, path: string, body?: unknown, idempotencyKey?: string) {
  const row = await getConnection(tenantId, 'XERO');
  if (!row?.externalAccountId) throw new XeroError('Xero is not connected');
  const token = await freshAccessToken(row, (refresh_token) => tokenRequest({ grant_type: 'refresh_token', refresh_token }));
  const res = await fetch(`https://api.xero.com/api.xro/2.0${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'xero-tenant-id': row.externalAccountId,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new XeroError(`Xero API error (${res.status})${data?.Message ? `: ${data.Message}` : ''}`);
  return data;
}

async function linkFor(tenantId: string, entity: 'CONTACT' | 'INVOICE', localId: string) {
  const [row] = await db.select().from(xeroLinks).where(and(eq(xeroLinks.tenantId, tenantId), eq(xeroLinks.entity, entity), eq(xeroLinks.localId, localId))).limit(1);
  return row?.xeroId ?? null;
}

async function saveLink(tenantId: string, entity: 'CONTACT' | 'INVOICE', localId: string, xeroId: string) {
  await db.insert(xeroLinks).values({ id: crypto.randomUUID(), tenantId, entity, localId, xeroId }).onConflictDoNothing();
}

async function findOrCreateContact(tenantId: string, client: typeof users.$inferSelect): Promise<string> {
  const existing = await linkFor(tenantId, 'CONTACT', client.id);
  if (existing) return existing;
  const created = await xero(tenantId, 'POST', '/Contacts', {
    Contacts: [
      {
        Name: `${client.name} (#${client.id.slice(0, 8)})`,
        EmailAddress: client.email ?? undefined,
        Phones: client.phone ? [{ PhoneType: 'MOBILE', PhoneNumber: client.phone }] : undefined,
      },
    ],
  });
  const id = created?.Contacts?.[0]?.ContactID as string | undefined;
  if (!id) throw new XeroError('Xero did not return a contact');
  await saveLink(tenantId, 'CONTACT', client.id, id);
  return id;
}

async function bankAccountCode(tenantId: string): Promise<{ Code?: string; AccountID?: string }> {
  const fixed = process.env.XERO_BANK_ACCOUNT_CODE?.trim();
  if (fixed) return { Code: fixed };
  const data = await xero(tenantId, 'GET', `/Accounts?where=${encodeURIComponent('Type=="BANK"&&Status=="ACTIVE"')}`);
  const banks = (data?.Accounts ?? []) as { AccountID: string; Name: string; Code?: string }[];
  if (!banks.length) throw new XeroError('Xero has no bank account to record the payment in. Add one, or set XERO_BANK_ACCOUNT_CODE.');
  const pick = banks.length === 1 ? banks[0] : banks.find((b) => /stripe/i.test(b.Name)) ?? banks[0];
  return { AccountID: pick.AccountID };
}

/** Adds a just-paid invoice to Xero. A no-op when Xero isn't set up or connected, or it's already there. */
export async function pushPaidInvoiceToXero(tenantId: string, invoiceId: string): Promise<void> {
  if (!xeroConfigured()) return;
  const conn = await getConnection(tenantId, 'XERO');
  if (!conn) return;
  if (await linkFor(tenantId, 'INVOICE', invoiceId)) return;

  const data = await getInvoiceWithItems(invoiceId);
  if (!data || !data.client) return;
  const { invoice, items, client } = data;
  const contactId = await findOrCreateContact(tenantId, client);
  const account = process.env.XERO_SALES_ACCOUNT_CODE?.trim() || '200';
  // A tip can also be on the invoice as its own isTip line; it's added once, from tipCents.
  const lines = items.filter((i) => !i.isTip).map((i) => ({ Description: i.description, Quantity: 1, UnitAmount: (i.amountCents / 100).toFixed(2), AccountCode: account }));
  if (invoice.tipCents > 0) lines.push({ Description: 'Tip', Quantity: 1, UnitAmount: (invoice.tipCents / 100).toFixed(2), AccountCode: account });

  const created = await xero(
    tenantId,
    'POST',
    '/BankTransactions',
    {
      BankTransactions: [
        {
          Type: 'RECEIVE',
          Contact: { ContactID: contactId },
          BankAccount: await bankAccountCode(tenantId),
          Date: (invoice.paidAt ?? new Date()).toISOString().slice(0, 10),
          Reference: invoice.invoiceNumber ? `INV-${invoice.invoiceNumber}` : invoice.id.slice(0, 8),
          LineAmountTypes: 'Inclusive',
          LineItems: lines,
        },
      ],
    },
    `trashcan-invoice-${invoice.id}`,
  );
  const id = created?.BankTransactions?.[0]?.BankTransactionID as string | undefined;
  if (!id) throw new XeroError('Xero did not return the transaction');
  await saveLink(tenantId, 'INVOICE', invoiceId, id);
}
