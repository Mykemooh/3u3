import { test } from 'node:test';
import assert from 'node:assert/strict';
import { db, seeded, makeUser } from './helpers/fixtures';
import { bookings, invoices, notificationLog, reviews, users } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { billableLines, recordOfflinePayment, sendInvoice, InvoiceError } from '@/lib/invoices';
import { normalizePhone, phoneKey, samePhone } from '@/lib/phone';
import { bookingLinkFor } from '@/lib/url';
import { reportProblem } from '@/lib/quality';
import { attachAddressToOpenVisits, getUpcomingBookingsForClient } from '@/lib/data';
import { addresses } from '@/db/schema';

test('an invoice with no stored lines still reads as its total, and a gap shows as an adjustment', () => {
  const none = billableLines({ totalCents: 15000 }, [], 'Standard Cleaning', '2026-09-24T09:00:00');
  assert.equal(none.length, 1);
  assert.equal(none[0].amountCents, 15000);
  assert.match(none[0].description, /^Standard Cleaning — /);
  const gap = billableLines({ totalCents: 15000 }, [{ id: 'a', description: 'Clean', amountCents: 12000 }, { id: 't', description: 'Tip', amountCents: 2000, isTip: true }]);
  assert.deepEqual(gap.map((l) => [l.description, l.amountCents]), [['Clean', 12000], ['Adjustment', 3000]]);
  const exact = billableLines({ totalCents: 12000 }, [{ id: 'a', description: 'Clean', amountCents: 12000 }]);
  assert.equal(exact.length, 1);
  assert.deepEqual(billableLines({ totalCents: 0 }, []), []);
});

test('phone numbers store as E.164 and match however they were typed', async () => {
  assert.equal(normalizePhone('(713) 555-0601'), '+17135550601');
  assert.equal(normalizePhone('+1 7135550601'), '+17135550601');
  assert.equal(normalizePhone('1-713-555-0601'), '+17135550601');
  assert.equal(phoneKey('713.555.0601'), '7135550601');
  assert.equal(phoneKey('12345'), null);
  const { tenant } = await seeded();
  const legacy = await makeUser(tenant.id, 'CUSTOMER', { phone: '+1 832 555 0142' });
  const found = await db.select().from(users).where(samePhone('(832) 555-0142')!);
  assert.deepEqual(found.map((u) => u.id), [legacy.id]);
});

test('a company without its own domain gets a booking link that remembers it', () => {
  const old = process.env.TENANT_BASE_DOMAIN;
  delete process.env.TENANT_BASE_DOMAIN;
  assert.match(bookingLinkFor({ slug: 'sparkle', name: 'Sparkle & Co.' }), /\/c\/sparkle$/);
  assert.match(bookingLinkFor({ slug: '3u3-cleaning', name: '3U3 Cleaning' }), /\/new$/);
  assert.equal(bookingLinkFor({ slug: 'sparkle', name: 'Sparkle', customDomain: 'book.sparkle.com' }), 'https://book.sparkle.com/new');
  process.env.TENANT_BASE_DOMAIN = 'trashcan.app';
  assert.equal(bookingLinkFor({ slug: 'sparkle', name: 'Sparkle' }, '?service=DEEP'), 'https://sparkle.trashcan.app/new?service=DEEP');
  if (old === undefined) delete process.env.TENANT_BASE_DOMAIN;
  else process.env.TENANT_BASE_DOMAIN = old;
});

let day = 3;
async function draftInvoice(status: 'DRAFT' | 'SENT' = 'DRAFT') {
  const { tenant, client, standard, crew } = await seeded();
  const bookingId = crypto.randomUUID();
  const d = String((day += 1)).padStart(2, '0');
  await db.insert(bookings).values({ id: bookingId, tenantId: tenant.id, clientId: client.id, serviceTypeId: standard.id, crewId: crew.id, slotStart: `2026-08-${d}T09:00:00`, slotEnd: `2026-08-${d}T11:00:00`, status: 'COMPLETED' });
  const id = crypto.randomUUID();
  await db.insert(invoices).values({ id, tenantId: tenant.id, bookingId, clientId: client.id, status, totalCents: 15000, invoiceNumber: 70000 + Math.floor(Math.random() * 9999) });
  return { id, tenant, bookingId, client };
}

test('without card payments an invoice still goes out, and the owner records the payment', async () => {
  const old = process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_SECRET_KEY;
  const { id, tenant } = await draftInvoice();
  const sent = await sendInvoice(id);
  assert.equal(sent.online, false);
  assert.match(sent.url, new RegExp(`/account/invoices/${id}$`));
  assert.equal((await db.select().from(invoices).where(eq(invoices.id, id)))[0].status, 'SENT');

  // Another company can't mark it paid.
  await assert.rejects(recordOfflinePayment(id, crypto.randomUUID(), 'CASH'), InvoiceError);
  await recordOfflinePayment(id, tenant.id, 'CHECK', { id: 'x', name: 'Owner' }, 'Check #1');
  const row = (await db.select().from(invoices).where(eq(invoices.id, id)))[0];
  assert.equal(row.status, 'PAID');
  assert.ok(row.paidAt);
  await assert.rejects(recordOfflinePayment(id, tenant.id, 'CASH'), /already paid/);
  if (old !== undefined) process.env.STRIPE_SECRET_KEY = old;
});

test('a client reporting a problem reaches the owner and reopens a re-clean on their review', async () => {
  const { tenant, bookingId, client } = await draftInvoice();
  await db.insert(reviews).values({ id: crypto.randomUUID(), tenantId: tenant.id, bookingId, clientId: client.id, rating: 5 });
  await reportProblem({ tenantId: tenant.id, bookingId, clientId: client.id, note: 'Mirror still streaky' });
  const review = (await db.select().from(reviews).where(eq(reviews.bookingId, bookingId)))[0];
  assert.equal(review.recleanStatus, 'REQUESTED');
  const alert = await db.select().from(notificationLog).where(and(eq(notificationLog.relatedBookingId, bookingId), eq(notificationLog.recipient, 'admin')));
  assert.equal(alert.length, 1);
  assert.match(alert[0].triggerEvent, /^RECLEAN_REQUESTED: .*Mirror still streaky/);
});

test('visits booked before an address existed pick it up; finished visits are not upcoming', async () => {
  const { tenant, standard, crew } = await seeded();
  const c = await makeUser(tenant.id, 'CUSTOMER');
  const open = crypto.randomUUID();
  const done = crypto.randomUUID();
  await db.insert(bookings).values([
    { id: open, tenantId: tenant.id, clientId: c.id, serviceTypeId: standard.id, crewId: crew.id, slotStart: '2099-01-05T09:00:00', slotEnd: '2099-01-05T11:00:00', status: 'CONFIRMED' },
    { id: done, tenantId: tenant.id, clientId: c.id, serviceTypeId: standard.id, crewId: crew.id, slotStart: '2099-01-02T09:00:00', slotEnd: '2099-01-02T11:00:00', status: 'COMPLETED' },
  ]);
  await db.insert(addresses).values({ id: crypto.randomUUID(), userId: c.id, line1: '1 Main St', city: 'Katy', state: 'TX', isPrimary: true });
  await attachAddressToOpenVisits(c.id);
  const rows = await db.select().from(bookings).where(eq(bookings.clientId, c.id));
  assert.ok(rows.find((b) => b.id === open)!.addressId);
  assert.equal(rows.find((b) => b.id === done)!.addressId, null);
  assert.deepEqual((await getUpcomingBookingsForClient(c.id)).map((b) => b.id), [open]);
});
