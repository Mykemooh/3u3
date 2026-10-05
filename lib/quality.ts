import { db } from '@/db/client';
import { reviews, roomRatings, jobChecklistItems, jobs, bookings, notificationLog, tenants, users } from '@/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { getOwnerEmail } from '@/lib/data';
import { sendEmail, simpleEmail } from '@/lib/email';
import { appUrl } from '@/lib/url';

/**
 * Room-by-room quality score. After a clean, the client rates the visit
 * and, optionally, each room 1–5. A low score anywhere (2 or under) opens
 * a re-clean request for the owner; a happy client (4+ overall, no room
 * under 4) is offered the company's Google review link. Unhappy clients
 * are never sent to Google — their feedback goes to the owner first.
 */

export const RECLEAN_THRESHOLD = 2;
export const GOOGLE_THRESHOLD = 4;

export class QualityError extends Error {}

export async function rateRooms(input: {
  tenantId: string;
  bookingId: string;
  reviewId: string;
  ratings: { itemId: string; rating: number }[];
}) {
  const job = (await db.select().from(jobs).where(eq(jobs.bookingId, input.bookingId)).limit(1))[0];
  if (!job) throw new QualityError('Visit not found.');
  const items = await db.select().from(jobChecklistItems).where(eq(jobChecklistItems.jobId, job.id));
  const valid = input.ratings.filter((r) => items.some((i) => i.id === r.itemId) && r.rating >= 1 && r.rating <= 5);
  for (const r of valid) {
    const item = items.find((i) => i.id === r.itemId)!;
    await db
      .insert(roomRatings)
      .values({
        id: crypto.randomUUID(),
        tenantId: input.tenantId,
        reviewId: input.reviewId,
        bookingId: input.bookingId,
        jobChecklistItemId: item.id,
        roomName: item.roomName,
        rating: Math.round(r.rating),
      })
      .onConflictDoNothing();
  }
  return valid.length;
}

/**
 * Decides what happens after a review: a re-clean request for the owner,
 * or the Google review link for the client. Returns what the client sees.
 */
export async function afterReview(input: { tenantId: string; bookingId: string; reviewId: string }) {
  const review = (await db.select().from(reviews).where(eq(reviews.id, input.reviewId)).limit(1))[0];
  if (!review) return { googleReviewUrl: null, recleanRequested: false };
  const rooms = await db.select().from(roomRatings).where(eq(roomRatings.reviewId, review.id));
  const low = rooms.filter((r) => r.rating <= RECLEAN_THRESHOLD);
  const tenant = (await db.select().from(tenants).where(eq(tenants.id, input.tenantId)).limit(1))[0];

  if (review.rating <= RECLEAN_THRESHOLD || low.length > 0) {
    await db.update(reviews).set({ recleanStatus: 'REQUESTED' }).where(eq(reviews.id, review.id));
    const client = (await db.select().from(users).where(eq(users.id, review.clientId)).limit(1))[0];
    const booking = (await db.select().from(bookings).where(eq(bookings.id, input.bookingId)).limit(1))[0];
    const what = low.length ? low.map((r) => `${r.roomName} (${r.rating}/5)`).join(', ') : `the visit (${review.rating}/5)`;
    const message = `${client?.name ?? 'A client'} rated ${what} on ${booking?.slotStart.slice(0, 10) ?? 'their last clean'} — schedule a re-clean.`;
    await db.insert(notificationLog).values({
      id: crypto.randomUUID(),
      tenantId: input.tenantId,
      channel: 'EMAIL',
      recipient: 'admin',
      triggerEvent: `RECLEAN_REQUESTED: ${message}`,
      relatedBookingId: input.bookingId,
      isRead: false,
    });
    const owner = await getOwnerEmail(input.tenantId);
    if (owner) {
      await sendEmail({
        to: owner,
        subject: `Re-clean requested — ${client?.name ?? 'a client'}`,
        html: simpleEmail({
          brandName: tenant?.name ?? 'TrashCan',
          heading: 'A client wasn’t happy with a room',
          body: `${message}\n\nReach out today and offer to come back. Their comment: ${review.comment ?? '(none)'}`,
          cta: { label: 'Open reviews', url: appUrl('/admin/reviews') },
        }),
      }).catch(() => false);
    }
    return { googleReviewUrl: null, recleanRequested: true };
  }

  const happy = review.rating >= GOOGLE_THRESHOLD && rooms.every((r) => r.rating >= GOOGLE_THRESHOLD);
  return { googleReviewUrl: happy ? tenant?.googleReviewUrl ?? null : null, recleanRequested: false };
}

/** Average room scores and re-clean counts, for reports and the reviews page. */
export async function qualitySummary(tenantId: string) {
  const rooms = await db.select().from(roomRatings).where(eq(roomRatings.tenantId, tenantId));
  const byRoom = new Map<string, { total: number; n: number }>();
  for (const r of rooms) {
    const key = r.roomName.replace(/\s+\d+$/, '');
    const e = byRoom.get(key) ?? { total: 0, n: 0 };
    e.total += r.rating;
    e.n += 1;
    byRoom.set(key, e);
  }
  const recleans = await db.select().from(reviews).where(and(eq(reviews.tenantId, tenantId), eq(reviews.recleanStatus, 'REQUESTED')));
  return {
    rooms: Array.from(byRoom.entries())
      .map(([room, e]) => ({ room, average: Math.round((e.total / e.n) * 10) / 10, ratings: e.n }))
      .sort((a, b) => a.average - b.average),
    openRecleans: recleans.length,
  };
}

export async function setRecleanStatus(tenantId: string, reviewId: string, status: 'SCHEDULED' | 'DONE' | 'DISMISSED') {
  await db.update(reviews).set({ recleanStatus: status }).where(and(eq(reviews.id, reviewId), eq(reviews.tenantId, tenantId)));
}

export async function roomRatingsForReviews(reviewIds: string[]) {
  if (!reviewIds.length) return [];
  return db.select().from(roomRatings).where(inArray(roomRatings.reviewId, reviewIds));
}
