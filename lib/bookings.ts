import { db } from '@/db/client';
import { bookings, jobs, jobChecklistItems, checklistTemplates, checklistTemplateItems, notificationLog } from '@/db/schema';
import { eq } from 'drizzle-orm';

export class DoubleBookingError extends Error {
  constructor() {
    super('That time slot was just booked by someone else. Please pick another.');
    this.name = 'DoubleBookingError';
  }
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}

function toMinutes(iso: string) {
  const [, time] = iso.split('T');
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Create a confirmed booking, enforcing "no slot is ever fabricated and no
 * crew is ever double-booked" (PRD section 8) via a single DB transaction:
 * re-check for any overlapping active booking on this crew immediately
 * before inserting. The unique(crew_id, slot_start) index is a hard
 * backstop against the exact-same-instant race.
 */
export async function createBooking(input: {
  tenantId: string;
  clientId: string;
  serviceTypeId: string;
  crewId: string;
  addressId?: string;
  slotStart: string;
  slotEnd: string;
  cadence: 'ONE_TIME' | 'BIWEEKLY' | 'MONTHLY';
  priceCents?: number;
  isQuoteVisit?: boolean;
}) {
  const dateOnly = input.slotStart.split('T')[0];
  const newStart = toMinutes(input.slotStart);
  const newEnd = toMinutes(input.slotEnd);

  return db.transaction(async (tx) => {
    const sameCrewBookings = await tx.select().from(bookings).where(eq(bookings.crewId, input.crewId));
    const sameDayBookings = sameCrewBookings.filter(
      (b) => b.status !== 'CANCELLED' && b.slotStart.startsWith(dateOnly),
    );

    const conflict = sameDayBookings.some((b) =>
      overlaps(newStart, newEnd, toMinutes(b.slotStart), toMinutes(b.slotEnd)),
    );
    if (conflict) throw new DoubleBookingError();

    const bookingId = crypto.randomUUID();
    await tx.insert(bookings).values({
      id: bookingId,
      tenantId: input.tenantId,
      clientId: input.clientId,
      serviceTypeId: input.serviceTypeId,
      crewId: input.crewId,
      addressId: input.addressId,
      slotStart: input.slotStart,
      slotEnd: input.slotEnd,
      cadence: input.cadence,
      status: 'CONFIRMED',
      priceCents: input.priceCents,
      isQuoteVisit: input.isQuoteVisit ?? false,
    });

    // Quote visits don't get a cleaner-facing job/checklist — only real
    // cleaning jobs do.
    if (!input.isQuoteVisit) {
      const templateRows = await tx
        .select()
        .from(checklistTemplates)
        .where(eq(checklistTemplates.serviceTypeId, input.serviceTypeId))
        .limit(1);
      const template = templateRows[0];

      const jobId = crypto.randomUUID();
      await tx.insert(jobs).values({ id: jobId, bookingId, crewId: input.crewId, status: 'PENDING' });

      if (template) {
        const items = await tx
          .select()
          .from(checklistTemplateItems)
          .where(eq(checklistTemplateItems.templateId, template.id));
        for (const item of items) {
          await tx.insert(jobChecklistItems).values({
            id: crypto.randomUUID(),
            jobId,
            templateItemId: item.id,
            roomName: item.roomName,
            taskDetail: item.taskDetail,
            sortOrder: item.sortOrder,
            status: 'PENDING',
          });
        }
      }
    }

    return bookingId;
  });
}

/**
 * Quote visits (PRD 6.2) are on the owner's separate calendar — no crew,
 * no service type, no checklist/job. Conflict check is a simple exact
 * slot-start match since quote-visit windows are fixed, non-overlapping.
 */
export async function createQuoteVisitBooking(input: {
  tenantId: string;
  clientId: string;
  addressId?: string;
  slotStart: string;
  slotEnd: string;
}) {
  return db.transaction(async (tx) => {
    const existing = await tx.select().from(bookings).where(eq(bookings.tenantId, input.tenantId));
    const conflict = existing.some(
      (b) => b.isQuoteVisit && b.status !== 'CANCELLED' && b.slotStart === input.slotStart,
    );
    if (conflict) throw new DoubleBookingError();

    const bookingId = crypto.randomUUID();
    await tx.insert(bookings).values({
      id: bookingId,
      tenantId: input.tenantId,
      clientId: input.clientId,
      addressId: input.addressId,
      slotStart: input.slotStart,
      slotEnd: input.slotEnd,
      cadence: 'ONE_TIME',
      status: 'REQUESTED',
      isQuoteVisit: true,
    });

    return bookingId;
  });
}

export async function logNotification(input: {
  tenantId: string;
  channel: 'EMAIL' | 'SMS';
  recipient: string;
  triggerEvent: string;
  relatedBookingId?: string;
  costCents?: number;
}) {
  await db.insert(notificationLog).values({
    id: crypto.randomUUID(),
    tenantId: input.tenantId,
    channel: input.channel,
    recipient: input.recipient,
    triggerEvent: input.triggerEvent,
    costCents: input.costCents ?? 0,
    status: 'SENT',
    relatedBookingId: input.relatedBookingId,
  });
}
