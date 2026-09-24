import { db } from '@/db/client';
import { businessTodayISO } from '@/lib/time';
import { bookings, jobs, users, serviceTypes, crews, addresses } from '@/db/schema';
import { eq, inArray } from 'drizzle-orm';

export class DispatchError extends Error {}

function pad(n: number) {
  return n.toString().padStart(2, '0');
}

function toISODate(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toMinutes(dt: string) {
  const [h, m] = dt.split('T')[1].split(':').map(Number);
  return h * 60 + m;
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Monday of the week containing `dateISO` (or today). Monday-first because
 * that's how a cleaning route week is actually planned — nobody dispatches
 * a crew starting from Sunday.
 */
export function startOfWeek(dateISO?: string): string {
  const base = new Date(`${dateISO ?? businessTodayISO()}T12:00:00`);
  const day = base.getDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day;
  base.setDate(base.getDate() + diff);
  return toISODate(base);
}

export function shiftWeek(startISO: string, weeks: number): string {
  const d = new Date(`${startISO}T12:00:00`);
  d.setDate(d.getDate() + weeks * 7);
  return toISODate(d);
}

export function weekDates(startISO: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(`${startISO}T12:00:00`);
    d.setDate(d.getDate() + i);
    out.push(toISODate(d));
  }
  return out;
}

export type ScheduleEntry = {
  bookingId: string;
  jobId?: string;
  jobStatus?: 'PENDING' | 'IN_PROGRESS' | 'COMPLETE';
  bookingStatus: 'REQUESTED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';
  clientId: string;
  clientName: string;
  serviceName: string;
  slotStart: string;
  slotEnd: string;
  crewId: string | null;
  addressLine?: string;
  isQuoteVisit: boolean;
};

/**
 * Everything happening in one week, already grouped the way a dispatch
 * board reads it: crew down the side, days across the top. Quote visits
 * come back separately — they're the owner's own calendar, not crew
 * capacity (PRD 6.2 vs 6.4).
 */
export async function getWeekSchedule(tenantId: string, startISO: string) {
  const dates = weekDates(startISO);
  const first = dates[0];
  const last = dates[dates.length - 1];

  const all = await db.select().from(bookings).where(eq(bookings.tenantId, tenantId));
  const inWeek = all.filter((b) => {
    const date = b.slotStart.split('T')[0];
    return date >= first && date <= last && b.status !== 'CANCELLED';
  });

  const crewRows = await db.select().from(crews).where(eq(crews.tenantId, tenantId));

  const clientIds = [...new Set(inWeek.map((b) => b.clientId))];
  const clientRows = clientIds.length ? await db.select().from(users).where(inArray(users.id, clientIds)) : [];
  const clientMap = Object.fromEntries(clientRows.map((c) => [c.id, c]));

  const serviceIds = [...new Set(inWeek.map((b) => b.serviceTypeId).filter(Boolean))] as string[];
  const serviceRows = serviceIds.length
    ? await db.select().from(serviceTypes).where(inArray(serviceTypes.id, serviceIds))
    : [];
  const serviceMap = Object.fromEntries(serviceRows.map((s) => [s.id, s]));

  const addressIds = [...new Set(inWeek.map((b) => b.addressId).filter(Boolean))] as string[];
  const addressRows = addressIds.length
    ? await db.select().from(addresses).where(inArray(addresses.id, addressIds))
    : [];
  const addressMap = Object.fromEntries(addressRows.map((a) => [a.id, a]));

  const bookingIds = inWeek.map((b) => b.id);
  const jobRows = bookingIds.length ? await db.select().from(jobs).where(inArray(jobs.bookingId, bookingIds)) : [];
  const jobMap = Object.fromEntries(jobRows.map((j) => [j.bookingId, j]));

  const entries: ScheduleEntry[] = inWeek
    .map((b) => {
      const job = jobMap[b.id];
      const address = b.addressId ? addressMap[b.addressId] : undefined;
      return {
        bookingId: b.id,
        jobId: job?.id,
        jobStatus: job?.status,
        bookingStatus: b.status,
        clientId: b.clientId,
        clientName: clientMap[b.clientId]?.name ?? 'Unknown',
        serviceName: b.isQuoteVisit
          ? 'Quote visit'
          : b.serviceTypeId
            ? (serviceMap[b.serviceTypeId]?.name ?? 'Cleaning')
            : 'Cleaning',
        slotStart: b.slotStart,
        slotEnd: b.slotEnd,
        crewId: b.crewId,
        addressLine: address ? `${address.line1}, ${address.city}` : undefined,
        isQuoteVisit: b.isQuoteVisit,
      };
    })
    .sort((a, b) => a.slotStart.localeCompare(b.slotStart));

  return {
    dates,
    crews: crewRows,
    // [crewId][dateISO] -> entries
    byCrew: Object.fromEntries(
      crewRows.map((crew) => [
        crew.id,
        Object.fromEntries(
          dates.map((date) => [
            date,
            entries.filter((e) => !e.isQuoteVisit && e.crewId === crew.id && e.slotStart.startsWith(date)),
          ]),
        ),
      ]),
    ) as Record<string, Record<string, ScheduleEntry[]>>,
    // Jobs with no crew assigned — these are the ones needing dispatch.
    unassigned: Object.fromEntries(
      dates.map((date) => [
        date,
        entries.filter((e) => !e.isQuoteVisit && !e.crewId && e.slotStart.startsWith(date)),
      ]),
    ) as Record<string, ScheduleEntry[]>,
    quoteVisits: Object.fromEntries(
      dates.map((date) => [date, entries.filter((e) => e.isQuoteVisit && e.slotStart.startsWith(date))]),
    ) as Record<string, ScheduleEntry[]>,
  };
}

/**
 * Move a cleaning job to a different crew. Runs the same no-double-booking
 * check as creating a booking (PRD section 8) — reassigning is exactly as
 * capable of double-booking a crew as booking is, so it gets the same
 * transactional guard rather than trusting the UI. The job row moves too,
 * or the cleaner app would keep showing it to the old crew.
 */
export async function reassignBookingCrew(bookingId: string, crewId: string) {
  return db.transaction(async (tx) => {
    const booking = (await tx.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1))[0];
    if (!booking) throw new DispatchError('Booking not found');
    if (booking.isQuoteVisit) throw new DispatchError('Quote visits are on your own calendar, not a crew’s');
    if (booking.status === 'CANCELLED' || booking.status === 'COMPLETED') {
      throw new DispatchError(`This booking is already ${booking.status.toLowerCase()}`);
    }
    if (booking.crewId === crewId) return;

    const crew = (await tx.select().from(crews).where(eq(crews.id, crewId)).limit(1))[0];
    if (!crew || crew.tenantId !== booking.tenantId) throw new DispatchError('Crew not found');

    const date = booking.slotStart.split('T')[0];
    const newStart = toMinutes(booking.slotStart);
    const newEnd = toMinutes(booking.slotEnd);

    const targetCrewBookings = await tx.select().from(bookings).where(eq(bookings.crewId, crewId));
    const clash = targetCrewBookings.some(
      (b) =>
        b.id !== bookingId &&
        b.status !== 'CANCELLED' &&
        b.slotStart.startsWith(date) &&
        overlaps(newStart, newEnd, toMinutes(b.slotStart), toMinutes(b.slotEnd)),
    );
    if (clash) throw new DispatchError(`${crew.name} is already booked at that time`);

    await tx.update(bookings).set({ crewId }).where(eq(bookings.id, bookingId));
    await tx.update(jobs).set({ crewId }).where(eq(jobs.bookingId, bookingId));
  });
}
