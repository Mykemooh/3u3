import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seeded, makeUser, db } from './helpers/fixtures';
import { createBooking } from '@/lib/bookings';
import { addDays } from '@/lib/recurring';
import { businessTodayISO } from '@/lib/time';
import { JobError } from '@/lib/jobs';
import { signRouteChoice, type RouteChoice } from '@/lib/directions';
import { recordTripRoute, ensureTripStarted, markTripArrived, travelReport, TOLL_EXPENSE_CATEGORY } from '@/lib/trips';
import { expenses, jobTrips, jobs } from '@/db/schema';
import { and, eq } from 'drizzle-orm';

// The toll expense is the thing that must never double up: one per trip,
// however often the crew app retries, and in step with the route picked.

// Each job gets its own far-off day, so the crew is never double-booked
// against this file or another test file's bookings.
let day = 0;
async function newJob() {
  const { tenant, crew, standard, address, client, admin } = await seeded();
  day += 1;
  const date = addDays(businessTodayISO(), 500 + Math.floor(Math.random() * 400) * 10 + day);
  const bookingId = await createBooking({
    tenantId: tenant.id, clientId: client.id, serviceTypeId: standard.id, crewId: crew.id, addressId: address.id,
    slotStart: `${date}T15:00:00`, slotEnd: `${date}T17:00:00`, cadence: 'ONE_TIME', priceCents: 18000,
  });
  const job = (await db.select().from(jobs).where(eq(jobs.bookingId, bookingId)))[0]!;
  return { tenant, crew, job, viewer: { id: admin.id, role: 'ADMIN' as const } };
}

const choice = (jobId: string, over: Partial<RouteChoice> = {}) =>
  signRouteChoice({
    jobId, provider: 'google', label: 'fastest', summary: 'Westpark Tollway', distanceMeters: 29290, durationSeconds: 1440,
    toll: { kind: 'priced', cents: 340, currency: 'USD' }, tollPass: 'EZ TAG', avoidTolls: false, tollsOffered: true, issuedAt: Date.now(), ...over,
  });

const tollRows = (jobId: string) => db.select().from(expenses).where(and(eq(expenses.jobId, jobId), eq(expenses.category, TOLL_EXPENSE_CATEGORY)));

test('a toll route adds exactly one Tolls expense per trip, even on retries and races', async () => {
  const { tenant, crew, job, viewer } = await newJob();
  const first = await recordTripRoute(job.id, viewer, choice(job.id));
  assert.deepEqual(first, { recorded: true, tollExpense: 'added' });
  let rows = await tollRows(job.id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].amountCents, 340);
  assert.equal(rows[0].tenantId, tenant.id);
  assert.equal(rows[0].crewId, crew.id);
  assert.equal(rows[0].vendor, 'Tolls (EZ TAG)');
  assert.match(rows[0].notes ?? '', /Fastest via Westpark Tollway/);

  assert.equal((await recordTripRoute(job.id, viewer, choice(job.id))).tollExpense, 'updated', 'a retry updates, never adds');
  await Promise.all([1, 2, 3, 4].map(() => recordTripRoute(job.id, viewer, choice(job.id, { toll: { kind: 'priced', cents: 425, currency: 'USD' } }))));
  rows = await tollRows(job.id);
  assert.equal(rows.length, 1, 'parallel retries still leave one');
  assert.equal(rows[0].amountCents, 425);

  const trips = await db.select().from(jobTrips).where(eq(jobTrips.jobId, job.id));
  assert.equal(trips.length, 1);
  assert.equal(trips[0].tollExpenseId, rows[0].id);
  assert.equal(trips[0].tollState, 'PRICED');
  assert.equal(trips[0].plannedDistanceMeters, 29290);
});

test('switching to a toll-free route removes the toll; arrival freezes the trip', async () => {
  const { job, viewer, tenant } = await newJob();
  await recordTripRoute(job.id, viewer, choice(job.id));
  const free = await recordTripRoute(job.id, viewer, choice(job.id, { label: 'noTolls', toll: { kind: 'none' }, tollPass: null }));
  assert.equal(free.tollExpense, 'removed');
  assert.equal((await tollRows(job.id)).length, 0);
  let trip = (await db.select().from(jobTrips).where(eq(jobTrips.jobId, job.id)))[0]!;
  assert.equal(trip.avoidedTolls, true);
  assert.equal(trip.tollExpenseId, null);

  // Mapbox can only say "toll road, price unknown": recorded, but no expense to add.
  assert.equal((await recordTripRoute(job.id, viewer, choice(job.id, { provider: 'mapbox', toll: { kind: 'unpriced' }, tollPass: null }))).tollExpense, 'unchanged');
  assert.equal((await tollRows(job.id)).length, 0);

  await recordTripRoute(job.id, viewer, choice(job.id));
  assert.equal((await tollRows(job.id)).length, 1);

  const arrivedAt = new Date(Date.now() + 25 * 60_000);
  assert.equal(await markTripArrived(job.id, arrivedAt, 'map'), true);
  assert.equal(await markTripArrived(job.id, new Date(arrivedAt.getTime() + 600_000), 'job_start'), false, 'first arrival wins');
  trip = (await db.select().from(jobTrips).where(eq(jobTrips.jobId, job.id)))[0]!;
  assert.equal(trip.arrivalSource, 'map');
  assert.ok(trip.actualDurationSeconds! >= 24 * 60 && trip.actualDurationSeconds! <= 26 * 60);

  assert.deepEqual(await recordTripRoute(job.id, viewer, choice(job.id, { toll: { kind: 'none' } })), { recorded: false, tollExpense: 'unchanged' });
  assert.equal((await tollRows(job.id)).length, 1, 'after arrival the toll stays');

  const report = await travelReport(tenant.id, businessTodayISO(), businessTodayISO());
  assert.ok(report.total.trips >= 1);
  assert.ok(report.total.tollsCents >= 340);
});

test('an expense an admin deleted stays deleted when the crew retries', async () => {
  const { job, viewer } = await newJob();
  await recordTripRoute(job.id, viewer, choice(job.id));
  const [row] = await tollRows(job.id);
  await db.delete(expenses).where(eq(expenses.id, row.id));
  assert.equal((await recordTripRoute(job.id, viewer, choice(job.id))).tollExpense, 'updated');
  assert.equal((await tollRows(job.id)).length, 0);
});

test('Start driving opens the trip; a later pick fills the route but keeps the start time', async () => {
  const { job, viewer } = await newJob();
  const startedAt = new Date(Date.now() - 5 * 60_000);
  await ensureTripStarted(job, viewer.id, startedAt, { distanceMeters: 30000, durationSeconds: 1500 });
  await ensureTripStarted(job, viewer.id, new Date(), null);
  let trip = (await db.select().from(jobTrips).where(eq(jobTrips.jobId, job.id)))[0]!;
  assert.equal(trip.provider, 'tracking');
  assert.equal(trip.plannedDurationSeconds, 1500);
  await recordTripRoute(job.id, viewer, choice(job.id));
  trip = (await db.select().from(jobTrips).where(eq(jobTrips.jobId, job.id)))[0]!;
  assert.equal(trip.provider, 'google');
  assert.equal(trip.startedAt.getTime(), startedAt.getTime());
});

test('only the job’s crew can record, and only with a route the server signed', async () => {
  const { job, viewer, tenant } = await newJob();
  const outsider = await makeUser(tenant.id, 'CLEANER');
  await assert.rejects(recordTripRoute(job.id, { id: outsider.id, role: 'CLEANER' }, choice(job.id)), (e: unknown) => e instanceof JobError && e.status === 403);
  await assert.rejects(recordTripRoute(job.id, viewer, choice('another-job')), (e: unknown) => e instanceof JobError && e.status === 400);
  await assert.rejects(recordTripRoute(job.id, viewer, 'forged.token'), JobError);
  assert.equal((await tollRows(job.id)).length, 0);
});
