import { db } from '@/db/client';
import { jobs, jobChecklistItems, jobMedia, bookings, users, serviceTypes, addresses } from '@/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { getOwnerEmail } from '@/lib/data';
import { isOnJob, canLeadJob } from '@/lib/team';
import { createDraftInvoiceForBooking, sendInvoice } from '@/lib/invoices';
import { logNotification } from '@/lib/bookings';
import { sendEmail, jobCompleteCustomerEmail, jobCompleteOwnerEmail } from '@/lib/email';
import { appUrl } from '@/lib/url';
import { formatSlotDateLong } from '@/lib/time';
import { MEDIA_LIMITS, deleteStored, type MediaKind, type MediaPhase } from '@/lib/storage';
import { mediaExpiry } from '@/lib/mediaRetention';

/**
 * The job lifecycle, in one place: start → document each room (photos and
 * videos, before and after) → finish. Every API route calls into here, so
 * the rules below are enforced identically whether the request came from
 * the crew app, an admin, or anything added later.
 */

export class JobError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export type Viewer = { id: string; role: 'ADMIN' | 'CLEANER' | 'CUSTOMER' };

export function viewerFrom(session: any): Viewer | null {
  const u = session?.user as { id?: string; role?: string } | undefined;
  if (!u?.id || !u.role) return null;
  return { id: u.id, role: u.role as Viewer['role'] };
}

export type JobMediaRow = typeof jobMedia.$inferSelect;
export type ChecklistItemRow = typeof jobChecklistItems.$inferSelect;

/** Everything a job screen needs, in one read. Deleted media is excluded. */
export async function loadJob(jobId: string) {
  const job = (await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1))[0];
  if (!job) return null;
  const booking = (await db.select().from(bookings).where(eq(bookings.id, job.bookingId)).limit(1))[0];
  if (!booking) return null;
  const [client, service, address, items, media] = await Promise.all([
    db.select().from(users).where(eq(users.id, booking.clientId)).limit(1).then((r) => r[0]),
    booking.serviceTypeId
      ? db.select().from(serviceTypes).where(eq(serviceTypes.id, booking.serviceTypeId)).limit(1).then((r) => r[0])
      : Promise.resolve(undefined),
    booking.addressId
      ? db.select().from(addresses).where(eq(addresses.id, booking.addressId)).limit(1).then((r) => r[0])
      : Promise.resolve(undefined),
    db.select().from(jobChecklistItems).where(eq(jobChecklistItems.jobId, jobId)),
    db.select().from(jobMedia).where(and(eq(jobMedia.jobId, jobId), isNull(jobMedia.deletedAt))),
  ]);
  items.sort((a, b) => a.sortOrder - b.sortOrder);
  media.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return { job, booking, client, service, address, items, media };
}

/** A cleaner on this job (its team, or swapped onto it), or an admin. */
export async function canWorkJob(viewer: Viewer | null, job: { id: string; crewId: string }) {
  if (!viewer) return false;
  if (viewer.role === 'ADMIN') return true;
  if (viewer.role !== 'CLEANER') return false;
  return isOnJob(viewer.id, job);
}

/** Whether this viewer runs the job's trip and finish: an admin, or its Team Lead (lib/team.ts). */
export async function canLead(viewer: Viewer | null, job: { id: string; crewId: string }) {
  if (!viewer) return false;
  if (viewer.role === 'ADMIN') return true;
  return viewer.role === 'CLEANER' && canLeadJob(viewer.id, job);
}

/** Anyone who may look at the job: its crew, an admin, or the client it's for. */
export async function canViewJob(viewer: Viewer | null, job: { id: string; crewId: string }, booking: { clientId: string }) {
  if (!viewer) return false;
  if (viewer.role === 'CUSTOMER') return booking.clientId === viewer.id;
  return canWorkJob(viewer, job);
}

export async function requireWorkable(jobId: string, viewer: Viewer | null) {
  const job = (await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1))[0];
  if (!job) throw new JobError('Job not found', 404);
  if (!viewer) throw new JobError('Sign in required', 401);
  if (!(await canWorkJob(viewer, job))) throw new JobError("You're not on this job", 403);
  return job;
}

/** requireWorkable, plus: only the Team Lead (or an admin) — for the trip and the finish. */
export async function requireLead(jobId: string, viewer: Viewer | null) {
  const job = await requireWorkable(jobId, viewer);
  if (!(await canLead(viewer, job))) throw new JobError('Only the Team Lead on this job can do that.', 403);
  return job;
}

// The crew's live position and route exist only for the drive over (see
// lib/tracking.ts); they're wiped the moment the crew arrives.
const CLEAR_TRACKING = {
  destLat: null,
  destLng: null,
  crewLat: null,
  crewLng: null,
  crewLocationAt: null,
  routeGeojson: null,
  routeDurationSeconds: null,
  routeUpdatedAt: null,
};

/**
 * Mark the crew as on site and working — from PENDING, or from EN_ROUTE
 * (the crew's "I've arrived" tap), which also ends live tracking.
 * Idempotent.
 *
 * When the property has "cleaner needs to know" notes on file (pets, gate
 * codes, anything the crew should see first — components/CrewJob.tsx shows
 * these before this button is tappable), the caller must say so has been
 * acknowledged. Enforced here too, not just client-side, so a bypassed UI
 * can't skip it.
 */
export async function startJob(jobId: string, viewer: Viewer | null, acknowledgedNotes = false) {
  const job = await requireLead(jobId, viewer);
  if (job.status === 'COMPLETE') throw new JobError('This job is already finished', 409);
  if (job.status === 'IN_PROGRESS') return job;

  const booking = (await db.select().from(bookings).where(eq(bookings.id, job.bookingId)).limit(1))[0];
  const address = booking?.addressId
    ? (await db.select().from(addresses).where(eq(addresses.id, booking.addressId)).limit(1))[0]
    : undefined;
  const hasNotes = !!(
    address?.notes?.trim() ||
    address?.pets?.trim() ||
    address?.parkingNotes?.trim() ||
    address?.allergyNotes?.trim() ||
    address?.doNotTouch?.trim() ||
    address?.entryCodeEncrypted
  );
  if (hasNotes && !acknowledgedNotes) {
    throw new JobError('Please review the cleaner notes for this address before starting.', 400);
  }

  const startedAt = new Date();
  const cleanerNotesAckAt = hasNotes ? startedAt : job.cleanerNotesAckAt;
  await db
    .update(jobs)
    .set({ status: 'IN_PROGRESS', startedAt, cleanerNotesAckAt, ...CLEAR_TRACKING })
    .where(eq(jobs.id, jobId));
  return { ...job, ...CLEAR_TRACKING, status: 'IN_PROGRESS' as const, startedAt, cleanerNotesAckAt };
}

/** A room the crew can document right now: job started, not yet finished. */
export async function requireOpenItem(jobId: string, itemId: string, viewer: Viewer | null) {
  const job = await requireWorkable(jobId, viewer);
  if (job.status === 'PENDING' || job.status === 'EN_ROUTE') throw new JobError('Tap "Start job" before adding photos.', 409);
  if (job.status === 'COMPLETE') throw new JobError('This job is finished, so its photos are locked.', 409);
  const item = (await db.select().from(jobChecklistItems).where(eq(jobChecklistItems.id, itemId)).limit(1))[0];
  if (!item || item.jobId !== jobId) throw new JobError('Room not found on this job', 404);
  return { job, item };
}

async function liveMediaFor(itemId: string) {
  return db
    .select()
    .from(jobMedia)
    .where(and(eq(jobMedia.itemId, itemId), isNull(jobMedia.deletedAt)));
}

export async function countMedia(itemId: string, phase: MediaPhase) {
  return (await liveMediaFor(itemId)).filter((m) => m.phase === phase).length;
}

/**
 * Recomputes a room's status from its media, against the owning job's photo
 * policy: before-and-after (default), after-only (before optional), or no
 * photos needed at all. Videos are welcome but optional either way — a room
 * is never blocked on a video. Keeps the legacy photo columns in step.
 *
 * A no-photos-needed job doesn't drive status from media at all (there is
 * none to expect) — completion there goes through markItemDone instead, so
 * this leaves the item's status untouched.
 */
export async function syncItem(itemId: string) {
  const item = (await db.select().from(jobChecklistItems).where(eq(jobChecklistItems.id, itemId)).limit(1))[0];
  if (!item) return null;
  const job = (await db.select().from(jobs).where(eq(jobs.id, item.jobId)).limit(1))[0];
  const media = (await liveMediaFor(itemId)).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const before = media.find((m) => m.phase === 'BEFORE' && m.kind === 'PHOTO')?.url ?? null;
  const after = media.find((m) => m.phase === 'AFTER' && m.kind === 'PHOTO')?.url ?? null;

  const patch: Partial<ChecklistItemRow> = { beforePhotoPath: before, afterPhotoPath: after };
  if (item.status !== 'SKIPPED' && !job?.noPhotosNeeded) {
    const done = job?.requireBeforePhoto === false ? !!after : !!before && !!after;
    patch.status = done ? 'COMPLETE' : 'PENDING';
    patch.completedAt = done ? item.completedAt ?? new Date() : null;
  }
  await db.update(jobChecklistItems).set(patch).where(eq(jobChecklistItems.id, itemId));
  return { ...item, ...patch } as ChecklistItemRow;
}

/** Mark (or unmark) a room done by hand, for jobs where no photos are needed at all. */
export async function setItemDone(jobId: string, itemId: string, viewer: Viewer | null, done: boolean) {
  const { job, item } = await requireOpenItem(jobId, itemId, viewer);
  if (!job.noPhotosNeeded) throw new JobError('This job requires before-and-after photos for each room.', 409);
  if (item.status === 'SKIPPED') throw new JobError('Undo the skip first.', 409);
  const patch = { status: (done ? 'COMPLETE' : 'PENDING') as ChecklistItemRow['status'], completedAt: done ? new Date() : null };
  await db.update(jobChecklistItems).set(patch).where(eq(jobChecklistItems.id, itemId));
  return { ...item, ...patch };
}

/**
 * Admin-only: set a job's photo policy. "No pictures needed" implies the
 * before photo is moot, so it always clears requireBeforePhoto too.
 * Every non-skipped room is re-synced immediately so a policy change is
 * reflected in room status right away, not just for the next upload.
 */
export async function setPhotoPolicy(
  jobId: string,
  viewer: Viewer | null,
  patch: { requireBeforePhoto?: boolean; noPhotosNeeded?: boolean },
) {
  if (!viewer || viewer.role !== 'ADMIN') throw new JobError('Admins only', 403);
  const job = (await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1))[0];
  if (!job) throw new JobError('Job not found', 404);
  if (job.status === 'COMPLETE') throw new JobError('This job is already finished.', 409);

  const noPhotosNeeded = patch.noPhotosNeeded ?? job.noPhotosNeeded;
  const next = {
    noPhotosNeeded,
    requireBeforePhoto: noPhotosNeeded ? false : patch.requireBeforePhoto ?? job.requireBeforePhoto,
  };
  await db.update(jobs).set(next).where(eq(jobs.id, jobId));

  const items = await db.select().from(jobChecklistItems).where(eq(jobChecklistItems.jobId, jobId));
  for (const item of items) {
    if (item.status !== 'SKIPPED') await syncItem(item.id);
  }
  const updatedItems = await db.select().from(jobChecklistItems).where(eq(jobChecklistItems.jobId, jobId));
  updatedItems.sort((a, b) => a.sortOrder - b.sortOrder);
  return { job: { ...job, ...next }, items: updatedItems };
}

export async function addMedia(input: {
  jobId: string;
  itemId: string;
  phase: MediaPhase;
  kind: MediaKind;
  url: string;
  storageKey: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  durationSeconds: number | null;
  uploadedBy: string;
}) {
  if ((await countMedia(input.itemId, input.phase)) >= MEDIA_LIMITS.perPhase) {
    throw new JobError(`That's the limit of ${MEDIA_LIMITS.perPhase} files for this room. Remove one to add another.`, 409);
  }
  const row = {
    id: crypto.randomUUID(),
    ...input,
    expiresAt: mediaExpiry(input.kind),
  };
  await db.insert(jobMedia).values(row);
  const item = await syncItem(input.itemId);
  const media = (await db.select().from(jobMedia).where(eq(jobMedia.id, row.id)).limit(1))[0];
  return { media, item };
}

export async function removeMedia(jobId: string, mediaId: string, viewer: Viewer | null) {
  const media = (await db.select().from(jobMedia).where(eq(jobMedia.id, mediaId)).limit(1))[0];
  if (!media || media.jobId !== jobId || media.deletedAt) throw new JobError('File not found', 404);
  await requireOpenItem(jobId, media.itemId, viewer);
  await db.update(jobMedia).set({ deletedAt: new Date() }).where(eq(jobMedia.id, mediaId));
  await deleteStored({ key: media.storageKey, url: media.url });
  const item = await syncItem(media.itemId);
  return { item };
}

export async function setSkip(jobId: string, itemId: string, viewer: Viewer | null, reason: string | null) {
  const { item } = await requireOpenItem(jobId, itemId, viewer);
  if (reason) {
    await db
      .update(jobChecklistItems)
      .set({ status: 'SKIPPED', skipReason: reason.slice(0, 280), completedAt: new Date() })
      .where(eq(jobChecklistItems.id, item.id));
  } else {
    await db
      .update(jobChecklistItems)
      .set({ status: 'PENDING', skipReason: null, completedAt: null })
      .where(eq(jobChecklistItems.id, item.id));
  }
  return syncItem(item.id);
}

/**
 * Finish the job. Every room must have a before and after photo, or a
 * logged reason it was skipped. Then, in order: the job and booking are
 * marked complete, the invoice is drafted at the client's agreed rate,
 * an autopay client is charged immediately (lib/invoices.ts sendInvoice)
 * with no admin step in between — anyone else's invoice stays a DRAFT
 * for the admin to review and send — the client is emailed a link to
 * their before-and-after photos, and the owner is told there's an
 * invoice to review. Nothing after the status change can block
 * completion — a failed email, or a declined autopay charge, is logged,
 * not fatal (a declined autopay charge still leaves a SENT invoice with
 * its normal emailed pay link, same as sendInvoice always does).
 */
export async function completeJob(jobId: string, viewer: Viewer | null) {
  const job = await requireLead(jobId, viewer);
  if (job.status === 'COMPLETE') return { alreadyComplete: true as const, invoiceId: null };
  if (job.status === 'PENDING' || job.status === 'EN_ROUTE') throw new JobError('Start the job first.', 409);

  const items = await db.select().from(jobChecklistItems).where(eq(jobChecklistItems.jobId, jobId));
  const open = items.filter((i) => i.status === 'PENDING');
  if (open.length > 0) {
    throw new JobError(
      `${open.length} room${open.length === 1 ? '' : 's'} still need${open.length === 1 ? 's' : ''} a before and after photo, or a reason for skipping: ${open
        .map((i) => i.roomName)
        .join(', ')}.`,
    );
  }

  const completedAt = new Date();
  await db.update(jobs).set({ status: 'COMPLETE', completedAt }).where(eq(jobs.id, jobId));
  await db.update(bookings).set({ status: 'COMPLETED' }).where(eq(bookings.id, job.bookingId));

  let invoiceId: string | null = null;
  try {
    invoiceId = await createDraftInvoiceForBooking(job.bookingId);
  } catch (err) {
    console.error('[jobs] invoice draft failed for booking', job.bookingId, err);
  }

  // Autopay means exactly that — charged the moment the cleaning is
  // done, no admin step in between. A non-autopay client's invoice stays
  // a DRAFT for the admin to review and send manually, same as before —
  // only an autopay client's invoice gets sent (and charged) here.
  if (invoiceId) {
    try {
      const booking = (await db.select().from(bookings).where(eq(bookings.id, job.bookingId)).limit(1))[0];
      const client = booking ? (await db.select().from(users).where(eq(users.id, booking.clientId)).limit(1))[0] : undefined;
      if (client?.autopayEnabled && client.stripeDefaultPaymentMethodId) {
        await sendInvoice(invoiceId);
      }
    } catch (err) {
      console.error('[jobs] autopay charge failed for invoice', invoiceId, err);
    }
  }

  try {
    await notifyJobComplete(jobId, invoiceId);
  } catch (err) {
    console.error('[jobs] completion notifications failed for job', jobId, err);
  }

  return { alreadyComplete: false as const, invoiceId };
}

async function notifyJobComplete(jobId: string, invoiceId: string | null) {
  const data = await loadJob(jobId);
  if (!data) return;
  const { booking, client, service, media, items } = data;
  const galleryUrl = appUrl(`/account/jobs/${jobId}`);
  const serviceName = service?.name ?? 'Your cleaning';
  const dateLabel = formatSlotDateLong(booking.slotStart);
  const photos = media.filter((m) => m.kind === 'PHOTO').length;
  const videos = media.filter((m) => m.kind === 'VIDEO').length;
  const rooms = items.filter((i) => i.status === 'COMPLETE').length;

  if (client?.email) {
    const { subject, html } = jobCompleteCustomerEmail({
      name: client.name,
      serviceName,
      dateLabel,
      rooms,
      photos,
      videos,
      galleryUrl,
    });
    const ok = await sendEmail({ to: client.email, subject, html });
    await logNotification({
      tenantId: booking.tenantId,
      channel: 'EMAIL',
      recipient: client.email,
      triggerEvent: ok ? 'JOB_COMPLETE_CUSTOMER' : 'JOB_COMPLETE_CUSTOMER_NOT_DELIVERED',
      relatedBookingId: booking.id,
    });
  }

  const ownerEmail = await getOwnerEmail(booking.tenantId);
  if (ownerEmail) {
    const { subject, html } = jobCompleteOwnerEmail({
      clientName: client?.name ?? 'A client',
      serviceName,
      dateLabel,
      galleryUrl,
      invoiceUrl: invoiceId ? appUrl(`/admin/invoices/${invoiceId}`) : appUrl('/admin/invoices'),
    });
    const ok = await sendEmail({ to: ownerEmail, subject, html });
    await logNotification({
      tenantId: booking.tenantId,
      channel: 'EMAIL',
      recipient: ownerEmail,
      triggerEvent: ok ? 'JOB_COMPLETE_OWNER_ALERT' : 'JOB_COMPLETE_OWNER_ALERT_NOT_DELIVERED',
      relatedBookingId: booking.id,
    });
  }
}
