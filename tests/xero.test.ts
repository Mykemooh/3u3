import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { db, seeded } from './helpers/fixtures';
import { bookings, invoices, invoiceItems, xeroLinks } from '@/db/schema';
import { pushPaidInvoiceToXero, xeroAuthorizeUrl } from '@/lib/xero';
import { saveConnection } from '@/lib/companyConnections';
import { eq } from 'drizzle-orm';

const realFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = realFetch;
  delete process.env.XERO_CLIENT_ID;
  delete process.env.XERO_CLIENT_SECRET;
});

test('a paid invoice goes to Xero once, as money received, with line items and tip', async () => {
  const { tenant, client, standard, crew } = await seeded();
  const bookingId = crypto.randomUUID();
  await db.insert(bookings).values({ id: bookingId, tenantId: tenant.id, clientId: client.id, serviceTypeId: standard.id, crewId: crew.id, slotStart: '2026-09-01T09:00:00', slotEnd: '2026-09-01T11:00:00', status: 'COMPLETED' });
  const invoiceId = crypto.randomUUID();
  await db.insert(invoices).values({ id: invoiceId, tenantId: tenant.id, bookingId, clientId: client.id, status: 'PAID', totalCents: 15000, tipCents: 2000, invoiceNumber: 4242, paidAt: new Date('2026-09-02T15:00:00Z') });
  await db.insert(invoiceItems).values([
    { id: crypto.randomUUID(), invoiceId, description: 'Standard cleaning', amountCents: 12000, sortOrder: 0 },
    { id: crypto.randomUUID(), invoiceId, description: 'Inside fridge', amountCents: 3000, sortOrder: 1 },
    { id: crypto.randomUUID(), invoiceId, description: 'Tip', amountCents: 2000, sortOrder: 2, isTip: true },
  ]);

  // Not set up / not connected: silently nothing.
  let calls: { method: string; url: string; headers: Record<string, string>; body: any }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
    const u = String(url);
    calls.push({ method: init.method ?? 'GET', url: u, headers: (init.headers ?? {}) as Record<string, string>, body: init.body ? JSON.parse(String(init.body)) : null });
    if (u.endsWith('/Contacts')) return Response.json({ Contacts: [{ ContactID: 'c-1' }] });
    if (u.includes('/Accounts')) return Response.json({ Accounts: [{ AccountID: 'a-checking', Name: 'Checking' }, { AccountID: 'a-stripe', Name: 'Stripe clearing' }] });
    if (u.endsWith('/BankTransactions')) return Response.json({ BankTransactions: [{ BankTransactionID: 'bt-1' }] });
    return Response.json({});
  }) as typeof fetch;
  await pushPaidInvoiceToXero(tenant.id, invoiceId);
  assert.equal(calls.length, 0);

  process.env.XERO_CLIENT_ID = 'xid';
  process.env.XERO_CLIENT_SECRET = 'xsecret';
  assert.match(xeroAuthorizeUrl('s1'), /^https:\/\/login\.xero\.com\/identity\/connect\/authorize\?.*offline_access/);
  await pushPaidInvoiceToXero(tenant.id, invoiceId);
  assert.equal(calls.length, 0, 'not connected yet');

  await saveConnection(tenant.id, 'XERO', { access_token: 'xt', refresh_token: 'xr', expires_in: 1800 }, 'org-1', null, 'Xero');
  await pushPaidInvoiceToXero(tenant.id, invoiceId);
  const tx = calls.find((c) => c.url.endsWith('/BankTransactions'))!;
  assert.equal(tx.headers['xero-tenant-id'], 'org-1');
  assert.equal(tx.headers['Idempotency-Key'], `trashcan-invoice-${invoiceId}`);
  const body = tx.body.BankTransactions[0];
  assert.equal(body.Type, 'RECEIVE');
  assert.deepEqual(body.Contact, { ContactID: 'c-1' });
  assert.deepEqual(body.BankAccount, { AccountID: 'a-stripe' }, 'the Stripe account when there are several');
  assert.equal(body.Reference, 'INV-4242');
  assert.equal(body.Date, '2026-09-02');
  assert.deepEqual(body.LineItems.map((l: any) => [l.Description, l.UnitAmount]), [['Standard cleaning', '120.00'], ['Inside fridge', '30.00'], ['Tip', '20.00']]);

  calls = [];
  await pushPaidInvoiceToXero(tenant.id, invoiceId);
  assert.equal(calls.length, 0, 'already in Xero');
  assert.equal((await db.select().from(xeroLinks).where(eq(xeroLinks.localId, invoiceId)))[0].xeroId, 'bt-1');
});
