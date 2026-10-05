import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seeded, makeUser, db } from './helpers/fixtures';
import { addExpense, deleteExpense, expenseSummary, monthlyTotals, ExpenseError } from '@/lib/expenses';
import { cleaningReport, rangeFor, roomKind, roomTimes } from '@/lib/reports';
import { csvCell, toCsv } from '@/lib/csv';
import { segmentRecipients, createCampaign, sendCampaign, MarketingError } from '@/lib/marketing';
import { createBooking } from '@/lib/bookings';
import { addDays } from '@/lib/recurring';
import { businessTodayISO } from '@/lib/time';
import { bookings, jobs, jobChecklistItems, users } from '@/db/schema';
import { eq } from 'drizzle-orm';

test('CSV cells are quoted and never run as formulas', () => {
  assert.equal(csvCell('plain'), 'plain');
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
  assert.equal(csvCell('-12.50'), '-12.50', 'negative numbers stay numbers');
  assert.equal(toCsv(['A'], [[1], [null]]), 'A\r\n1\r\n\r\n');
});

test('date ranges', () => {
  assert.deepEqual(rangeFor('this_month', '2026-10-05'), { from: '2026-10-01', to: '2026-10-05' });
  assert.deepEqual(rangeFor('last_month', '2026-03-15'), { from: '2026-02-01', to: '2026-02-28' });
  assert.deepEqual(rangeFor('this_year', '2026-10-05'), { from: '2026-01-01', to: '2026-10-05' });
  assert.deepEqual(rangeFor('custom', '2026-10-05', { from: '2026-09-10', to: '2026-09-01' }), { from: '2026-10-01', to: '2026-10-05' }, 'a backwards range falls back');
  assert.equal(roomKind('Bathroom 2'), 'Bathroom');
  assert.equal(roomKind('Kitchen'), 'Kitchen');
});

test('expenses add up by category and month, and stay inside their company', async () => {
  const { tenant, admin, crew } = await seeded();
  const actor = { id: admin.id, name: admin.name };
  const month = businessTodayISO().slice(0, 7);
  const a = await addExpense(tenant.id, { spentOn: `${month}-01`, category: 'Cleaning supplies', vendor: 'Costco', amountCents: 8450, crewId: crew.id }, actor);
  await addExpense(tenant.id, { spentOn: `${month}-02`, category: 'Fuel and mileage', amountCents: 4000 }, actor);
  const s = await expenseSummary(tenant.id, `${month}-01`, `${month}-31`);
  assert.ok(s.totalCents >= 12450);
  assert.equal(s.byCategory.find((c) => c.category === 'Cleaning supplies')!.cents >= 8450, true);
  const trend = await monthlyTotals(tenant.id, month, 3);
  assert.equal(trend.length, 3);
  assert.equal(trend[2].month, month);
  await assert.rejects(addExpense(tenant.id, { spentOn: `${month}-03`, category: 'Other', amountCents: 100, crewId: 'not-a-team' }, actor), ExpenseError);
  await assert.rejects(deleteExpense('some-other-tenant', a, actor), ExpenseError, 'another company cannot delete it');
  await deleteExpense(tenant.id, a, actor);
});

test('the report counts finished cleans, room times and the money', async () => {
  const { tenant, crew, standard, address } = await seeded();
  const client = await makeUser(tenant.id, 'CUSTOMER');
  const date = addDays(businessTodayISO(), -1);
  const bookingId = await createBooking({
    tenantId: tenant.id, clientId: client.id, serviceTypeId: standard.id, crewId: crew.id, addressId: address.id,
    slotStart: `${date}T19:00:00`, slotEnd: `${date}T20:00:00`, cadence: 'ONE_TIME', priceCents: 20000,
  });
  const job = (await db.select().from(jobs).where(eq(jobs.bookingId, bookingId)))[0];
  const start = new Date(Date.now() - 3 * 3600_000);
  await db.update(jobs).set({ status: 'COMPLETE', startedAt: start, completedAt: new Date(start.getTime() + 150 * 60_000) }).where(eq(jobs.id, job.id));
  await db.update(bookings).set({ status: 'COMPLETED' }).where(eq(bookings.id, bookingId));
  const items = await db.select().from(jobChecklistItems).where(eq(jobChecklistItems.jobId, job.id));
  for (const [i, item] of items.entries()) {
    await db.update(jobChecklistItems).set({ status: 'COMPLETE', startedAt: start, completedAt: new Date(start.getTime() + (20 + i) * 60_000) }).where(eq(jobChecklistItems.id, item.id));
  }
  const report = await cleaningReport(tenant.id, addDays(date, -1), businessTodayISO());
  assert.ok(report.work.cleans >= 1);
  assert.ok(report.work.averageMinutes != null);
  const rooms = await roomTimes(tenant.id, date, date);
  assert.ok(rooms.length >= 1, 'rooms are timed');
  assert.ok(rooms.every((r) => r.averageMinutes >= 20 && r.averageMinutes < 60));
  assert.equal(typeof report.money.profitCents, 'number');
  assert.ok(report.team.length >= 1, 'the crew shows up in the team table');
});

test('campaign audiences skip unsubscribed clients; sending needs email connected', async () => {
  const { tenant, admin } = await seeded();
  const keen = await makeUser(tenant.id, 'CUSTOMER');
  const out = await makeUser(tenant.id, 'CUSTOMER', { marketingOptOut: true });
  for (const c of [keen, out]) {
    await db.insert(bookings).values({
      id: crypto.randomUUID(), tenantId: tenant.id, clientId: c.id, status: 'COMPLETED', cadence: 'ONE_TIME',
      slotStart: `${addDays(businessTodayISO(), -30)}T08:00:00`, slotEnd: `${addDays(businessTodayISO(), -30)}T09:00:00`, isQuoteVisit: false,
    } as typeof bookings.$inferInsert);
  }
  const audience = await segmentRecipients(tenant.id, 'ALL_ACTIVE');
  assert.ok(audience.some((u) => u.id === keen.id));
  assert.ok(!audience.some((u) => u.id === out.id), 'unsubscribed clients are never emailed');
  const id = await createCampaign(tenant.id, { name: 'Test', segment: 'ALL_ACTIVE', subject: 'Hi {firstName}', body: 'Hello there, {firstName}!' }, { id: admin.id, name: admin.name });
  await assert.rejects(sendCampaign(tenant.id, id), MarketingError, 'no Resend key in tests');
  const still = (await db.select().from(users).where(eq(users.id, keen.id)))[0];
  assert.equal(still.marketingOptOut, false);
});
