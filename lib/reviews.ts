import { reviewEvent } from '@/lib/events';
import { db } from '@/db/client';
import { reviews, bookings, users } from '@/db/schema';
import { and, desc, eq } from 'drizzle-orm';
import { getOwnerEmail } from '@/lib/data';
import { sendEmail, esc } from '@/lib/email';
import { appUrl } from '@/lib/url';

export class ReviewError extends Error {}

export async function getReviewForBooking(bookingId: string) {
  return (await db.select().from(reviews).where(eq(reviews.bookingId, bookingId)).limit(1))[0] ?? null;
}

/**
 * One review per booking — prompted on the client's before-and-after
 * gallery once the job is COMPLETE. Every review lands in the admin
 * portal unfeatured; an admin deliberately "features" the ones that
 * should show in the landing page's testimonial carousel, so nothing a
 * client writes goes public on its own.
 */
export async function submitReview(input: { tenantId: string; bookingId: string; clientId: string; rating: number; comment?: string | null }) {
  if (input.rating < 1 || input.rating > 5) throw new ReviewError('Rating must be between 1 and 5.');
  const existing = await getReviewForBooking(input.bookingId);
  if (existing) throw new ReviewError('This cleaning was already reviewed.');

  const id = crypto.randomUUID();
  await db.insert(reviews).values({
    id,
    tenantId: input.tenantId,
    bookingId: input.bookingId,
    clientId: input.clientId,
    rating: Math.round(input.rating),
    comment: input.comment?.trim() || null,
  });

  // Best-effort — a slow/failed notification never blocks the client
  // from seeing their own "thanks for the feedback" confirmation.
  try {
    const ownerEmail = await getOwnerEmail(input.tenantId);
    const client = (await db.select().from(users).where(eq(users.id, input.clientId)).limit(1))[0];
    if (ownerEmail) {
      const stars = '★'.repeat(Math.round(input.rating)) + '☆'.repeat(5 - Math.round(input.rating));
      await sendEmail({
        to: ownerEmail,
        subject: `New review: ${stars} from ${client?.name ?? 'a client'}`,
        html: `<div style="font-family:sans-serif;color:#0B1F3B;max-width:480px;margin:0 auto;">
          <h2 style="color:#1D4ED8;">3U3 Cleaning</h2>
          <p><strong>${esc(client?.name ?? 'A client')}</strong> left a review: <strong>${stars}</strong></p>
          ${input.comment ? `<p style="color:#334155;">"${esc(input.comment)}"</p>` : ''}
          <p><a href="${appUrl('/admin/reviews')}" style="color:#1D4ED8;">Review it in the admin portal →</a></p>
        </div>`,
      });
    }
  } catch (err) {
    console.warn('[reviews] owner notification failed:', err);
  }
  await reviewEvent(id);

  return id;
}

export type ReviewRow = { review: typeof reviews.$inferSelect; clientName: string; bookingLabel: string };

export async function getReviewsForTenant(tenantId: string): Promise<ReviewRow[]> {
  const rows = await db
    .select({ review: reviews, clientName: users.name, slotStart: bookings.slotStart })
    .from(reviews)
    .innerJoin(users, eq(reviews.clientId, users.id))
    .innerJoin(bookings, eq(reviews.bookingId, bookings.id))
    .where(eq(reviews.tenantId, tenantId));
  return rows
    .map((r) => ({ review: r.review, clientName: r.clientName, bookingLabel: r.slotStart.slice(0, 10) }))
    .sort((a, b) => b.review.createdAt.getTime() - a.review.createdAt.getTime());
}

export async function setReviewFeatured(tenantId: string, reviewId: string, featured: boolean) {
  const existing = (await db.select().from(reviews).where(and(eq(reviews.id, reviewId), eq(reviews.tenantId, tenantId))).limit(1))[0];
  if (!existing) throw new ReviewError('Review not found');
  await db.update(reviews).set({ featured }).where(eq(reviews.id, reviewId));
}

export type FeaturedReview = { rating: number; comment: string | null; clientName: string };

/** What the landing page's testimonial carousel reads — admin-curated, newest first. */
export async function getFeaturedReviews(tenantId: string, limit = 12): Promise<FeaturedReview[]> {
  const rows = await db
    .select({ rating: reviews.rating, comment: reviews.comment, clientName: users.name, createdAt: reviews.createdAt })
    .from(reviews)
    .innerJoin(users, eq(reviews.clientId, users.id))
    .where(and(eq(reviews.tenantId, tenantId), eq(reviews.featured, true)))
    .orderBy(desc(reviews.createdAt))
    .limit(limit);
  // First-name-plus-initial so a public carousel never prints a client's full legal name.
  return rows.map((r) => ({ rating: r.rating, comment: r.comment, clientName: firstNameAndInitial(r.clientName) }));
}

function firstNameAndInitial(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return parts[0] ?? 'A client';
  return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
}
