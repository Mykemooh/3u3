import { db } from '@/db/client';
import { bookings, jobs, invoices, jobMedia, serviceTypes, addresses } from '@/db/schema';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { JourneyStep } from '@/components/app/JourneyRail';
import { formatClock } from '@/lib/time';

export type AccountBooking = Awaited<ReturnType<typeof getAccountBookings>>[number];

/**
 * Every cleaning for one client, newest last, with its job, invoice and a
 * cover photo — what the account home and invoices list are built from.
 * Draft invoices are the office's working copy and are never shown to the
 * client until they've been sent.
 */
export async function getAccountBookings(clientId: string) {
  const rows = (await db.select().from(bookings).where(eq(bookings.clientId, clientId))).filter(
    (b) => !b.isQuoteVisit && b.status !== 'CANCELLED',
  );
  if (rows.length === 0) return [];
  const ids = rows.map((b) => b.id);
  const [jobRows, invoiceRows, services, addressRows] = await Promise.all([
    db.select().from(jobs).where(inArray(jobs.bookingId, ids)),
    db.select().from(invoices).where(inArray(invoices.bookingId, ids)),
    db.select().from(serviceTypes),
    db.select().from(addresses).where(eq(addresses.userId, clientId)),
  ]);
  const media = jobRows.length
    ? await db
        .select()
        .from(jobMedia)
        .where(and(inArray(jobMedia.jobId, jobRows.map((j) => j.id)), isNull(jobMedia.deletedAt)))
    : [];

  return rows
    .map((b) => {
      const job = jobRows.find((j) => j.bookingId === b.id) ?? null;
      const invoice = invoiceRows.find((i) => i.bookingId === b.id && i.status !== 'DRAFT' && i.status !== 'VOID') ?? null;
      const jobMediaRows = job ? media.filter((m) => m.jobId === job.id) : [];
      const cover =
        jobMediaRows.find((m) => m.phase === 'AFTER' && m.kind === 'PHOTO')?.url ??
        jobMediaRows.find((m) => m.kind === 'PHOTO')?.url ??
        null;
      const address = addressRows.find((a) => a.id === b.addressId) ?? addressRows[0] ?? null;
      return {
        booking: b,
        job,
        invoice,
        service: services.find((s) => s.id === b.serviceTypeId) ?? null,
        address,
        cover,
        photoCount: jobMediaRows.filter((m) => m.kind === 'PHOTO').length,
        videoCount: jobMediaRows.filter((m) => m.kind === 'VIDEO').length,
      };
    })
    .sort((a, b) => a.booking.slotStart.localeCompare(b.booking.slotStart));
}

/** Booked → Cleaning → Done → Invoiced → Paid, from real records only. */
export function cleaningJourney(row: Pick<AccountBooking, 'job' | 'invoice'>): JourneyStep[] {
  const { job, invoice } = row;
  const started = job?.status === 'IN_PROGRESS' || job?.status === 'COMPLETE';
  const complete = job?.status === 'COMPLETE';
  const sent = invoice?.status === 'SENT' || invoice?.status === 'PAID';
  const paid = invoice?.status === 'PAID';
  const state = (isDone: boolean, isCurrent: boolean) => (isDone ? 'done' : isCurrent ? 'current' : 'todo') as JourneyStep['state'];
  return [
    { label: 'Booked', state: 'done' },
    { label: 'Cleaning', state: state(complete, started), detail: job?.startedAt ? formatClock(job.startedAt) : undefined },
    { label: 'Done', state: state(complete, false), detail: job?.completedAt ? formatClock(job.completedAt) : undefined },
    { label: 'Invoice', state: state(sent, complete && !sent) },
    { label: 'Paid', state: state(paid, sent && !paid) },
  ];
}
