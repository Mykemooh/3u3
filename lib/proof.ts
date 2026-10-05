import { db } from '@/db/client';
import { jobs, bookings, jobChecklistItems, jobMedia, users, serviceTypes, tenants, addresses, reviews, roomRatings } from '@/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { staffForJob } from '@/lib/team';
import { randomBytes } from 'node:crypto';

/**
 * The visit proof report: one page per finished clean with arrival and
 * finish times, who cleaned, every room's checklist status and time,
 * before/after photos and the client's rating. Shared by link (a random
 * token on the job), so it settles "you didn't clean the oven" in one
 * message. Shows the city, never the street address or entry details.
 */
export async function proofByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const job = (await db.select().from(jobs).where(eq(jobs.proofToken, token)).limit(1))[0];
  if (!job || job.status !== 'COMPLETE') return null;
  const booking = (await db.select().from(bookings).where(eq(bookings.id, job.bookingId)).limit(1))[0];
  if (!booking) return null;
  const [tenant, client, service, address, items, media, staffIds, review] = await Promise.all([
    db.select().from(tenants).where(eq(tenants.id, booking.tenantId)).limit(1),
    db.select().from(users).where(eq(users.id, booking.clientId)).limit(1),
    booking.serviceTypeId ? db.select().from(serviceTypes).where(eq(serviceTypes.id, booking.serviceTypeId)).limit(1) : Promise.resolve([]),
    booking.addressId ? db.select().from(addresses).where(eq(addresses.id, booking.addressId)).limit(1) : Promise.resolve([]),
    db.select().from(jobChecklistItems).where(eq(jobChecklistItems.jobId, job.id)),
    db.select().from(jobMedia).where(and(eq(jobMedia.jobId, job.id), isNull(jobMedia.deletedAt), eq(jobMedia.kind, 'PHOTO'))),
    staffForJob(job),
    db.select().from(reviews).where(eq(reviews.bookingId, booking.id)).limit(1),
  ]);
  const staff = staffIds.length ? await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.tenantId, booking.tenantId)) : [];
  const rooms = review[0] ? await db.select().from(roomRatings).where(eq(roomRatings.reviewId, review[0].id)) : [];
  const minutes = (a: Date | null, b: Date | null) => (a && b ? Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000)) : null);
  return {
    company: { name: tenant[0]?.name ?? '', logoUrl: tenant[0]?.logoUrl ?? null },
    clientFirstName: (client[0]?.name ?? '').split(' ')[0],
    service: service[0]?.name ?? 'Cleaning',
    city: address[0] ? `${address[0].city}, ${address[0].state}` : null,
    date: booking.slotStart.slice(0, 10),
    arrivedAt: job.startedAt,
    finishedAt: job.completedAt,
    totalMinutes: minutes(job.startedAt, job.completedAt),
    team: staff.filter((s) => staffIds.includes(s.id)).map((s) => s.name.split(/[\s(]/)[0]),
    rooms: items
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((i) => ({
        id: i.id,
        name: i.roomName,
        task: i.taskDetail,
        status: i.status,
        skipReason: i.skipReason,
        minutes: minutes(i.startedAt, i.completedAt),
        before: media.filter((m) => m.itemId === i.id && m.phase === 'BEFORE').map((m) => m.url),
        after: media.filter((m) => m.itemId === i.id && m.phase === 'AFTER').map((m) => m.url),
        rating: rooms.find((r) => r.jobChecklistItemId === i.id)?.rating ?? null,
      })),
    rating: review[0]?.rating ?? null,
  };
}

/** The proof link for a finished job, minting its token the first time. */
export async function ensureProofToken(jobId: string): Promise<string | null> {
  const job = (await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1))[0];
  if (!job || job.status !== 'COMPLETE') return null;
  if (job.proofToken) return job.proofToken;
  const token = randomBytes(24).toString('base64url');
  await db.update(jobs).set({ proofToken: token }).where(eq(jobs.id, jobId));
  return token;
}
