import { db } from '@/db/client';
import {
  bookings, jobs, jobChecklistItems, checklistTemplates, checklistTemplateItems,
  notificationLog, serviceTypes, addresses,
} from '@/db/schema';
import { eq } from 'drizzle-orm';
import { businessNowISO } from '@/lib/time';
import { formatSlotLabel, formatDateLabel } from '@/lib/scheduling';
import { getAddressesFor, getUserById, getOwnerEmail, formatMoney } from '@/lib/data';
import { sendEmail, bookingConfirmedCustomerEmail, newBookingOwnerEmail } from '@/lib/email';
import { appUrl } from '@/lib/url';

export class DoubleBookingError extends Error {
  constructor() {
    super('That time slot was just booked by someone else. Please pick another.');
    this.name = 'DoubleBookingError';
  }
}

export class BookingNotFoundError extends Error {
  constructor() {
    super('Booking not found.');
    this.name = 'BookingNotFoundError';
  }
}

// The self-service cutoff: a client can change their own cadence,
// reschedule, or cancel up to this many hours before the cleaning begins.
// Admins are never subject to this.
export const SELF_SERVICE_CUTOFF_HOURS = 24;

export class BookingLockedError extends Error {
  constructor() {
    super(`Changes must be made at least ${SELF_SERVICE_CUTOFF_HOURS} hours before your cleaning begins — please call us to make changes.`);
    this.name = 'BookingLockedError';
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

/** Hours between business-local "now" and a naive slotStart string — both
 * businessNowISO() and slotStart are the same naive wall-clock shape, so a
 * plain Date diff is safe here (see lib/time.ts for why that matters). */
export function hoursUntilSlot(slotStart: string): number {
  const slotMs = new Date(slotStart).getTime();
  const nowMs = new Date(businessNowISO()).getTime();
  return (slotMs - nowMs) / (1000 * 60 * 60);
}

export function canModifyBooking(slotStart: string): boolean {
  return hoursUntilSlot(slotStart) >= SELF_SERVICE_CUTOFF_HOURS;
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
        const items = (
          await tx.select().from(checklistTemplateItems).where(eq(checklistTemplateItems.templateId, template.id))
        ).sort((a, b) => a.sortOrder - b.sortOrder);

        // The "Bedrooms"/"Bathrooms" template items (countBy set) become
        // "Bedroom 1", "Bedroom 2", ... / "Bathroom 1", "Bathroom 2", ...
        // matching the client's actual room counts (app/new, or set later
        // by the admin/client on their address) — every other room passes
        // through unchanged. Unknown or a count of 1 keeps the plain
        // singular name rather than "Bedroom 1".
        const address = input.addressId
          ? (await tx.select().from(addresses).where(eq(addresses.id, input.addressId)).limit(1))[0]
          : undefined;
        const countFor = (countBy: 'BEDROOMS' | 'BATHROOMS') =>
          Math.max(1, (countBy === 'BEDROOMS' ? address?.bedrooms : address?.bathrooms) ?? 1);
        const singularFor = (countBy: 'BEDROOMS' | 'BATHROOMS') => (countBy === 'BEDROOMS' ? 'Bedroom' : 'Bathroom');

        const expanded: { templateItemId: string; roomName: string; taskDetail: string | null }[] = [];
        for (const item of items) {
          if (!item.countBy) {
            expanded.push({ templateItemId: item.id, roomName: item.roomName, taskDetail: item.taskDetail });
            continue;
          }
          const count = countFor(item.countBy);
          const singular = singularFor(item.countBy);
          if (count <= 1) {
            expanded.push({ templateItemId: item.id, roomName: singular, taskDetail: item.taskDetail });
          } else {
            for (let i = 1; i <= count; i += 1) {
              expanded.push({ templateItemId: item.id, roomName: `${singular} ${i}`, taskDetail: item.taskDetail });
            }
          }
        }

        for (let i = 0; i < expanded.length; i += 1) {
          await tx.insert(jobChecklistItems).values({
            id: crypto.randomUUID(),
            jobId,
            templateItemId: expanded[i].templateItemId,
            roomName: expanded[i].roomName,
            taskDetail: expanded[i].taskDetail,
            sortOrder: i,
            status: 'PENDING',
          });
        }
      }
    }

    return bookingId;
  });
}

/**
 * The client confirmation + owner new-booking alert, shared by every path
 * that creates a real booking — the normal booking wizard
 * (app/api/bookings/route.ts) and a standby offer being accepted
 * (lib/standby.ts) both call this so the emails read identically either
 * way. Never fails the booking itself; errors are caught by the caller.
 */
export async function sendBookingConfirmationEmails(input: {
  tenantId: string;
  bookingId: string;
  clientId: string;
  serviceName: string;
  slotStart: string;
  slotEnd: string;
  priceCents: number | null;
  address?: { line1: string; city: string; state: string; zip: string | null };
}) {
  const client = await getUserById(input.clientId);
  const whenLabel = `${formatDateLabel(input.slotStart.slice(0, 10))}, ${formatSlotLabel(input.slotStart, input.slotEnd)}`;
  const addressLabel = input.address
    ? `${input.address.line1}, ${input.address.city}, ${input.address.state}${input.address.zip ? ` ${input.address.zip}` : ''}`
    : undefined;
  const priceLabel = input.priceCents != null ? formatMoney(input.priceCents) : undefined;

  if (client?.email) {
    const { subject, html } = bookingConfirmedCustomerEmail({
      name: client.name,
      serviceName: input.serviceName,
      whenLabel,
      addressLabel,
      priceLabel,
      accountUrl: appUrl('/account'),
    });
    const ok = await sendEmail({ to: client.email, subject, html });
    await logNotification({
      tenantId: input.tenantId,
      channel: 'EMAIL',
      recipient: client.email,
      triggerEvent: ok ? 'BOOKING_CONFIRMATION_CUSTOMER' : 'BOOKING_CONFIRMATION_CUSTOMER_NOT_DELIVERED',
      relatedBookingId: input.bookingId,
    });
  }

  const ownerEmail = await getOwnerEmail(input.tenantId);
  if (ownerEmail) {
    const { subject, html } = newBookingOwnerEmail({
      clientName: client?.name ?? 'A client',
      clientPhone: client?.phone ?? undefined,
      serviceName: input.serviceName,
      whenLabel,
      addressLabel,
      priceLabel,
      scheduleUrl: appUrl(`/admin/schedule?week=${input.slotStart.slice(0, 10)}`),
    });
    const ok = await sendEmail({ to: ownerEmail, subject, html });
    await logNotification({
      tenantId: input.tenantId,
      channel: 'EMAIL',
      recipient: ownerEmail,
      triggerEvent: ok ? 'NEW_BOOKING_OWNER_ALERT' : 'NEW_BOOKING_OWNER_ALERT_NOT_DELIVERED',
      relatedBookingId: input.bookingId,
    });
  }
}

/** Convenience wrapper for sendBookingConfirmationEmails when only the client's addressId is known. */
export async function sendBookingConfirmationEmailsForAddress(
  input: Omit<Parameters<typeof sendBookingConfirmationEmails>[0], 'address'> & { addressId?: string | null },
) {
  const addresses = input.addressId ? await getAddressesFor(input.clientId) : [];
  const address = addresses.find((a) => a.id === input.addressId) ?? addresses[0];
  return sendBookingConfirmationEmails({ ...input, address });
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
  serviceTypeId?: string;
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
      serviceTypeId: input.serviceTypeId,
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
  channel: 'EMAIL' | 'SMS' | 'WHATSAPP';
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

/** Loads a booking and checks it belongs to this client, isn't a quote
 * visit, and is still in an editable state — shared by the self-service
 * mutations below. */
async function loadEditableClientBooking(bookingId: string, clientId: string) {
  const rows = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
  const booking = rows[0];
  // Don't distinguish "doesn't exist" from "not yours" — same error either way.
  if (!booking || booking.clientId !== clientId) throw new BookingNotFoundError();
  if (booking.isQuoteVisit) throw new BookingNotFoundError();
  if (booking.status === 'CANCELLED' || booking.status === 'COMPLETED') {
    throw new Error('This booking can no longer be changed.');
  }
  if (!canModifyBooking(booking.slotStart)) throw new BookingLockedError();
  return booking;
}

/**
 * Customer self-service reschedule. Picks a free team for the new slot the
 * same way the original booking flow does (lib/capacity.ts → teamsFreeFor,
 * same retry-next-team pattern as POST /api/bookings), so it respects
 * multi-team capacity rather than assuming the booking's current team is
 * still free or still the only option.
 */
export async function rescheduleBookingByClient(input: {
  bookingId: string;
  clientId: string;
  slotStart: string;
  slotEnd: string;
}) {
  const booking = await loadEditableClientBooking(input.bookingId, input.clientId);
  if (!booking.serviceTypeId) throw new Error('This booking has no service set.');

  const service = (await db.select().from(serviceTypes).where(eq(serviceTypes.id, booking.serviceTypeId)).limit(1))[0];
  if (!service) throw new Error('Service not found.');

  const { teamsFreeFor } = await import('@/lib/capacity');
  const teams = await teamsFreeFor(booking.tenantId, service.defaultDurationMinutes, input.slotStart, input.slotEnd);

  for (const team of teams) {
    try {
      return await db.transaction(async (tx) => {
        const dateOnly = input.slotStart.split('T')[0];
        const newStart = toMinutes(input.slotStart);
        const newEnd = toMinutes(input.slotEnd);
        const sameTeamBookings = await tx.select().from(bookings).where(eq(bookings.crewId, team.id));
        const conflict = sameTeamBookings.some(
          (b) =>
            b.id !== booking.id &&
            b.status !== 'CANCELLED' &&
            b.slotStart.startsWith(dateOnly) &&
            overlaps(newStart, newEnd, toMinutes(b.slotStart), toMinutes(b.slotEnd)),
        );
        if (conflict) throw new DoubleBookingError();

        await tx
          .update(bookings)
          .set({ crewId: team.id, slotStart: input.slotStart, slotEnd: input.slotEnd })
          .where(eq(bookings.id, booking.id));

        return { ...booking, crewId: team.id, slotStart: input.slotStart, slotEnd: input.slotEnd };
      });
    } catch (err) {
      if (!(err instanceof DoubleBookingError)) throw err;
      // That team was just taken — try the next one free for this slot.
    }
  }
  throw new DoubleBookingError();
}

/** Customer self-service cadence change — only for services the admin has
 * flagged recurringEligible, same rule as booking creation. */
export async function updateBookingCadenceByClient(input: {
  bookingId: string;
  clientId: string;
  cadence: 'ONE_TIME' | 'BIWEEKLY' | 'MONTHLY';
}) {
  const booking = await loadEditableClientBooking(input.bookingId, input.clientId);

  if (input.cadence !== 'ONE_TIME' && booking.serviceTypeId) {
    const svc = (await db.select().from(serviceTypes).where(eq(serviceTypes.id, booking.serviceTypeId)).limit(1))[0];
    if (svc && !svc.recurringEligible) {
      throw new Error(`${svc.name} does not support recurring booking.`);
    }
  }

  await db.update(bookings).set({ cadence: input.cadence }).where(eq(bookings.id, booking.id));
  return { ...booking, cadence: input.cadence };
}

export async function cancelBookingByClient(input: { bookingId: string; clientId: string }) {
  const booking = await loadEditableClientBooking(input.bookingId, input.clientId);
  await db.update(bookings).set({ status: 'CANCELLED' }).where(eq(bookings.id, booking.id));
  return booking;
}
