import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seeded, makeUser, addToCrew, db } from './helpers/fixtures';
import { createBooking } from '@/lib/bookings';
import { startJob, startRoom, completeJob, setItemDone, setPhotoPolicy, JobError } from '@/lib/jobs';
import { submitReview } from '@/lib/reviews';
import { rateRooms, afterReview, qualitySummary } from '@/lib/quality';
import { proofByToken } from '@/lib/proof';
import { crewDashboard } from '@/lib/earnings';
import { addDays } from '@/lib/recurring';
import { businessTodayISO } from '@/lib/time';
import { jobs, jobChecklistItems, tenants, reviews, users } from '@/db/schema';
import { eq } from 'drizzle-orm';

async function jobFor(minutes: number) {
  const { tenant, client, crew, standard, address } = await seeded();
  const date = addDays(businessTodayISO(), 20);
  const h = String(Math.floor(minutes / 60)).padStart(2, '0');
  const m = String(minutes % 60).padStart(2, '0');
  const bookingId = await createBooking({
    tenantId: tenant.id, clientId: client.id, serviceTypeId: standard.id, crewId: crew.id, addressId: address.id,
    slotStart: `${date}T${h}:${m}:00`, slotEnd: `${date}T${String(Number(h) + 1).padStart(2, '0')}:${m}:00`, cadence: 'ONE_TIME', priceCents: 12000,
  });
  const job = (await db.select().from(jobs).where(eq(jobs.bookingId, bookingId)))[0];
  return { tenant, client, crew, bookingId, job };
}

test('any cleaner on the team can start the clock; GPS is stamped; only the lead finishes', async () => {
  const { crew, job, tenant } = await jobFor(6 * 60);
  const helper = await makeUser(tenant.id, 'CLEANER', { staffRole: 'JR_CLEANER' });
  await addToCrew(crew.id, helper.id);
  const viewer = { id: helper.id, role: 'CLEANER' as const };
  const started = await startJob(job.id, viewer, true, { lat: 29.78, lng: -95.82 });
  assert.equal(started.status, 'IN_PROGRESS');
  const row = (await db.select().from(jobs).where(eq(jobs.id, job.id)))[0];
  assert.equal(row.startedByUserId, helper.id);
  assert.equal(row.startLat, 29.78);

  // Room timer: starts once, then the room is marked done.
  const admin = (await seeded()).admin;
  await setPhotoPolicy(job.id, { id: admin.id, role: 'ADMIN' }, { noPhotosNeeded: true });
  const items = await db.select().from(jobChecklistItems).where(eq(jobChecklistItems.jobId, job.id));
  const first = await startRoom(job.id, items[0].id, viewer);
  assert.ok(first.startedAt);
  const again = await startRoom(job.id, items[0].id, viewer);
  assert.equal(again.startedAt!.getTime(), first.startedAt!.getTime(), 'starting twice keeps the first time');
  for (const i of items) await setItemDone(job.id, i.id, viewer, true);

  await assert.rejects(completeJob(job.id, viewer), JobError, 'a junior cleaner cannot finish when a lead is on the job');
  const lead = (await seeded()).lead;
  const done = await completeJob(job.id, { id: lead.id, role: 'CLEANER' }, { lat: 29.79, lng: -95.81 });
  assert.equal(done.alreadyComplete, false);
  const finished = (await db.select().from(jobs).where(eq(jobs.id, job.id)))[0];
  assert.equal(finished.finishedByUserId, lead.id);
  assert.ok(finished.proofToken, 'finishing makes the proof link');

  const proof = await proofByToken(finished.proofToken!);
  assert.ok(proof);
  assert.equal(proof!.rooms.length, items.length);
  assert.ok(proof!.rooms.every((r) => r.status === 'COMPLETE'));
  assert.ok(proof!.team.length >= 2);
  assert.equal(proof!.city, 'Katy, TX', 'city only, never the street');
  assert.equal(await proofByToken('not-a-real-token-xxxx'), null);
});

test('a low room score opens a re-clean; a happy client gets the Google link', async () => {
  const { tenant, client, bookingId, job } = await jobFor(7 * 60);
  await db.update(tenants).set({ googleReviewUrl: 'https://g.page/r/example/review' }).where(eq(tenants.id, tenant.id));
  await db.update(jobs).set({ status: 'COMPLETE' }).where(eq(jobs.id, job.id));
  const items = await db.select().from(jobChecklistItems).where(eq(jobChecklistItems.jobId, job.id));

  const reviewId = await submitReview({ tenantId: tenant.id, bookingId, clientId: client.id, rating: 4 });
  await rateRooms({ tenantId: tenant.id, bookingId, reviewId, ratings: [{ itemId: items[0].id, rating: 2 }, { itemId: items[1].id, rating: 5 }, { itemId: 'bogus', rating: 1 }] });
  const out = await afterReview({ tenantId: tenant.id, bookingId, reviewId });
  assert.equal(out.recleanRequested, true);
  assert.equal(out.googleReviewUrl, null, 'never send an unhappy client to Google');
  assert.equal((await db.select().from(reviews).where(eq(reviews.id, reviewId)))[0].recleanStatus, 'REQUESTED');

  const second = await jobFor(8 * 60);
  await db.update(jobs).set({ status: 'COMPLETE' }).where(eq(jobs.id, second.job.id));
  const r2 = await submitReview({ tenantId: tenant.id, bookingId: second.bookingId, clientId: client.id, rating: 5 });
  const happy = await afterReview({ tenantId: tenant.id, bookingId: second.bookingId, reviewId: r2 });
  assert.equal(happy.googleReviewUrl, 'https://g.page/r/example/review');

  const summary = await qualitySummary(tenant.id);
  assert.ok(summary.openRecleans >= 1);
  assert.ok(summary.rooms.length >= 1);
});

test("a cleaner's dashboard shows their placement and the payroll calendar", async () => {
  const { tenant, lead } = await seeded();
  await db.update(tenants).set({ payrollFrequency: 'BIWEEKLY', payrollAnchorDate: '2026-10-02' }).where(eq(tenants.id, tenant.id));
  await db.update(users).set({ payType: 'PER_CLEAN', payRateCentsPerClean: 4500 }).where(eq(users.id, lead.id));
  const d = await crewDashboard(lead.id);
  assert.ok(d);
  assert.ok(d!.period, 'payroll calendar set');
  assert.equal(d!.rateSet, true);
  assert.ok(d!.upcoming.every((u) => u.placement === 'Lead'), 'a Team Lead leads');
  assert.ok(d!.upcoming.every((u) => u.priceCents === null), 'prices hidden without the crew.pricing permission');
});
