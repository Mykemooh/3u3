import { test } from 'node:test';
import assert from 'node:assert/strict';
import { occurrences, describeRule, usHolidays, nthOfMonth, createSeries, generateVisits, skipVisit, changeFuture, setSeriesStatus, getSeriesDetail, addDays } from '@/lib/recurring';
import { rescheduleBooking } from '@/lib/dispatch';
import { businessTodayISO } from '@/lib/time';
import { seeded, makeUser, db } from './helpers/fixtures';
import { bookings, addresses } from '@/db/schema';
import { and, eq, ne } from 'drizzle-orm';

test('weekly, every 2 and every 4 weeks keep their rhythm from the start date', () => {
  const r = { pattern: 'EVERY_2_WEEKS' as const, startDate: '2026-10-06' };
  assert.deepEqual(occurrences(r, '2026-10-01', '2026-11-10'), ['2026-10-06', '2026-10-20', '2026-11-03']);
  // Asking from mid-cycle still lands on the series' own weeks.
  assert.deepEqual(occurrences(r, '2026-10-21', '2026-11-20'), ['2026-11-03', '2026-11-17']);
  assert.deepEqual(occurrences({ pattern: 'WEEKLY', startDate: '2026-10-06', endDate: '2026-10-20' }, '2026-10-01', '2026-12-01'), ['2026-10-06', '2026-10-13', '2026-10-20']);
  assert.equal(occurrences({ pattern: 'EVERY_4_WEEKS', startDate: '2026-10-06' }, '2026-10-01', '2026-12-31').length, 4);
});

test('custom weekdays and monthly nth weekday', () => {
  assert.deepEqual(
    occurrences({ pattern: 'CUSTOM_WEEKDAYS', startDate: '2026-10-05', weekdays: '1,4' }, '2026-10-05', '2026-10-16'),
    ['2026-10-05', '2026-10-08', '2026-10-12', '2026-10-15'],
  );
  // 2nd Tuesday of each month.
  assert.equal(nthOfMonth('2026-10-13'), 2);
  assert.deepEqual(
    occurrences({ pattern: 'MONTHLY_NTH_WEEKDAY', startDate: '2026-10-13', nth: 2 }, '2026-10-01', '2027-01-31'),
    ['2026-10-13', '2026-11-10', '2026-12-08', '2027-01-12'],
  );
  // Last Friday.
  assert.deepEqual(
    occurrences({ pattern: 'MONTHLY_NTH_WEEKDAY', startDate: '2026-10-30', nth: -1 }, '2026-10-01', '2026-12-31'),
    ['2026-10-30', '2026-11-27', '2026-12-25'],
  );
  assert.equal(describeRule({ pattern: 'MONTHLY_NTH_WEEKDAY', startDate: '2026-10-13', nth: 2, startMinutes: 540 }), 'The second Tuesday of each month at 9:00 AM');
});

test('holidays are skipped when asked', () => {
  assert.ok(usHolidays(2026).has('2026-11-26'), 'Thanksgiving 2026');
  assert.ok(usHolidays(2026).has('2026-09-07'), 'Labor Day 2026');
  const thursdays = { pattern: 'WEEKLY' as const, startDate: '2026-11-19' };
  assert.ok(occurrences(thursdays, '2026-11-19', '2026-12-03').includes('2026-11-26'));
  assert.ok(!occurrences({ ...thursdays, skipHolidays: true }, '2026-11-19', '2026-12-03').includes('2026-11-26'));
});

async function freshClient(tenantId: string) {
  const client = await makeUser(tenantId, 'CUSTOMER');
  await db.insert(addresses).values({ id: crypto.randomUUID(), userId: client.id, line1: '1 Test St', zip: '77494' });
  return client;
}

test('a series creates its visits, and a moved or skipped visit never comes back', async () => {
  const { tenant, crew, standard, admin } = await seeded();
  const client = await freshClient(tenant.id);
  const start = addDays(businessTodayISO(), 3);
  const { series, created, conflicts } = await createSeries(
    { tenantId: tenant.id, clientId: client.id, serviceTypeId: standard.id, crewId: crew.id, pattern: 'WEEKLY', startDate: start, startMinutes: 6 * 60, durationMinutes: 90, priceCents: 15000 },
    admin,
  );
  assert.equal(conflicts.length, 0);
  assert.equal(created.length, 8, 'eight weekly visits in the 56-day horizon');

  const detail = await getSeriesDetail(tenant.id, series.id);
  const [first, second] = detail!.visits;
  assert.equal(first.slotStart, `${start}T06:00:00`);
  assert.equal(first.priceCents, 15000);
  assert.ok(first.jobId, 'each visit gets a crew job');

  // Move the first visit an hour later: only it changes.
  await rescheduleBooking(first.id, { startTime: '07:00', endTime: '08:30' });
  // Skip the second.
  await skipVisit(tenant.id, second.id, admin);
  // The cron runs again: nothing is recreated or put back.
  const again = await generateVisits(series.id);
  assert.equal(again.created.length, 0);
  const after = await getSeriesDetail(tenant.id, series.id);
  assert.equal(after!.visits.find((v) => v.id === first.id)!.slotStart, `${start}T07:00:00`);
  assert.equal(after!.visits.find((v) => v.id === first.id)!.isSeriesException, true);
  assert.equal(after!.visits.find((v) => v.id === second.id)!.status, 'CANCELLED');
  assert.equal(after!.visits.filter((v) => v.status !== 'CANCELLED').length, 7);
});

test('changing this and future visits splits the series and keeps earlier ones', async () => {
  const { tenant, crew, standard, admin } = await seeded();
  const client = await freshClient(tenant.id);
  const start = addDays(businessTodayISO(), 2);
  const { series } = await createSeries(
    { tenantId: tenant.id, clientId: client.id, serviceTypeId: standard.id, crewId: crew.id, pattern: 'EVERY_2_WEEKS', startDate: start, startMinutes: 18 * 60, durationMinutes: 60 },
    admin,
  );
  const before = (await getSeriesDetail(tenant.id, series.id))!.visits;
  assert.equal(before.length, 4);
  const pivot = before[2].seriesOccurrenceDate!;
  const res = await changeFuture(tenant.id, series.id, pivot, { startMinutes: 19 * 60, priceCents: 9900 }, admin);
  assert.equal(res.replaced, 2);
  const old = (await getSeriesDetail(tenant.id, series.id))!;
  assert.equal(old.series.endDate, addDays(pivot, -1));
  assert.equal(old.visits.filter((v) => v.status !== 'CANCELLED').length, 2, 'the first two stay as they were');
  const next = (await getSeriesDetail(tenant.id, res.newSeries.id))!;
  assert.equal(next.visits[0].slotStart, `${pivot}T19:00:00`);
  assert.equal(next.visits[0].priceCents, 9900);
});

test('pausing removes upcoming visits; resuming brings them back', async () => {
  const { tenant, crew, standard, admin } = await seeded();
  const client = await freshClient(tenant.id);
  const { series } = await createSeries(
    { tenantId: tenant.id, clientId: client.id, serviceTypeId: standard.id, crewId: crew.id, pattern: 'EVERY_4_WEEKS', startDate: addDays(businessTodayISO(), 1), startMinutes: 20 * 60, durationMinutes: 60 },
    admin,
  );
  const paused = await setSeriesStatus(tenant.id, series.id, 'PAUSED', admin);
  assert.equal(paused.removed, 2);
  const live = await db.select().from(bookings).where(and(eq(bookings.seriesId, series.id), ne(bookings.status, 'CANCELLED')));
  assert.equal(live.length, 0);
  // Resuming doesn't resurrect the cancelled dates (they're claimed) —
  // it continues with dates not yet claimed.
  const resumed = await setSeriesStatus(tenant.id, series.id, 'ACTIVE', admin);
  assert.equal(resumed.created, 0);
});

test('a visit that clashes with an existing booking is reported, not double-booked', async () => {
  const { tenant, crew, standard, admin } = await seeded();
  const a = await freshClient(tenant.id);
  const b = await freshClient(tenant.id);
  const start = addDays(businessTodayISO(), 5);
  await createSeries({ tenantId: tenant.id, clientId: a.id, serviceTypeId: standard.id, crewId: crew.id, pattern: 'WEEKLY', startDate: start, startMinutes: 5 * 60, durationMinutes: 60 }, admin);
  const clash = await createSeries({ tenantId: tenant.id, clientId: b.id, serviceTypeId: standard.id, crewId: crew.id, pattern: 'EVERY_2_WEEKS', startDate: start, startMinutes: 5 * 60 + 30, durationMinutes: 60 }, admin);
  assert.ok(clash.conflicts.length >= 3);
  assert.equal(clash.created.length, 0);
});
