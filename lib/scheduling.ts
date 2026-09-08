// Admin-driven scheduling engine — PRD section 6.4.
//
// The app never fabricates or estimates a slot: every candidate window is
// derived from the crew's real settings (working hours, homes/day, per-
// service duration, commute buffer), and any window that collides with an
// existing CONFIRMED/REQUESTED booking on that crew is marked unavailable
// rather than hidden, so customers can see real capacity.
//
// Times are modeled as naive "business-local" wall-clock strings
// (YYYY-MM-DDTHH:MM:00) — there's a single service area / single timezone
// in V1, so we deliberately avoid timezone-conversion complexity.

export type Crew = {
  id: string;
  workStartMinutes: number;
  workEndMinutes: number;
  homesPerDay: number;
  commuteBufferMinutes: number;
};

export type BookedWindow = { slotStart: string; slotEnd: string };

export type Slot = {
  start: string; // ISO-ish local datetime
  end: string;
  available: boolean;
};

function pad(n: number) {
  return n.toString().padStart(2, '0');
}

function minutesToTimeStr(dateISO: string, minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${dateISO}T${pad(h)}:${pad(m)}:00`;
}

function toMinutesSinceMidnight(dt: string): number {
  const time = dt.split('T')[1];
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Generate the candidate job windows for one crew on one calendar date for
 * a service of a given duration, per PRD 6.4's packing rule: sequential
 * jobs back-to-back plus a commute buffer, starting at the crew's working
 * hours start, capped at homesPerDay windows and never exceeding the
 * working-hours end.
 *
 * With V1 defaults (8:00-5:00, 2.5h standard clean, 45min buffer) this
 * reproduces exactly the three fixed windows named in the PRD:
 * 8:00-10:30, 11:15-1:45, 2:30-5:00.
 */
export function generateDaySlots(
  crew: Crew,
  durationMinutes: number,
  dateISO: string,
  existingBookings: BookedWindow[],
): Slot[] {
  const slots: Slot[] = [];
  let cursor = crew.workStartMinutes;
  let count = 0;

  while (count < crew.homesPerDay && cursor + durationMinutes <= crew.workEndMinutes) {
    const startMin = cursor;
    const endMin = cursor + durationMinutes;
    const start = minutesToTimeStr(dateISO, startMin);
    const end = minutesToTimeStr(dateISO, endMin);

    const isBooked = existingBookings.some((b) => {
      // Only compare bookings on the same date.
      if (!b.slotStart.startsWith(dateISO)) return false;
      const bStart = toMinutesSinceMidnight(b.slotStart);
      const bEnd = toMinutesSinceMidnight(b.slotEnd);
      return overlaps(startMin, endMin, bStart, bEnd);
    });

    slots.push({ start, end, available: !isBooked });

    cursor = endMin + crew.commuteBufferMinutes;
    count += 1;
  }

  return slots;
}

/** Generate slots across the next N days (skipping none — admin can later add blackout days). */
export function generateUpcomingSlots(
  crew: Crew,
  durationMinutes: number,
  existingBookings: BookedWindow[],
  days = 10,
  startDate = new Date(),
): { date: string; slots: Slot[] }[] {
  const out: { date: string; slots: Slot[] }[] = [];
  for (let i = 1; i <= days; i += 1) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    const dateISO = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    out.push({ date: dateISO, slots: generateDaySlots(crew, durationMinutes, dateISO, existingBookings) });
  }
  return out;
}

/**
 * Quote-visit slots (PRD 6.2) are a separate, owner-run calendar — not the
 * crew's cleaning-job schedule (PRD 6.4 / open question in section 9). V1
 * models it as four fixed 30-minute visit windows per day.
 */
const QUOTE_VISIT_TIMES_MIN = [9 * 60, 11 * 60, 13 * 60, 15 * 60]; // 9, 11, 1, 3
const QUOTE_VISIT_DURATION_MIN = 30;

export function generateQuoteVisitDaySlots(
  dateISO: string,
  bookedStarts: string[],
): Slot[] {
  return QUOTE_VISIT_TIMES_MIN.map((startMin) => {
    const start = minutesToTimeStr(dateISO, startMin);
    const end = minutesToTimeStr(dateISO, startMin + QUOTE_VISIT_DURATION_MIN);
    return { start, end, available: !bookedStarts.includes(start) };
  });
}

export function generateUpcomingQuoteVisitSlots(
  bookedStarts: string[],
  days = 10,
  startDate = new Date(),
): { date: string; slots: Slot[] }[] {
  const out: { date: string; slots: Slot[] }[] = [];
  for (let i = 1; i <= days; i += 1) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    const dateISO = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    out.push({ date: dateISO, slots: generateQuoteVisitDaySlots(dateISO, bookedStarts) });
  }
  return out;
}

export function formatSlotLabel(startIso: string, endIso: string): string {
  const fmt = (iso: string) => {
    const minutes = toMinutesSinceMidnight(iso);
    const h24 = Math.floor(minutes / 60);
    const m = minutes % 60;
    const ampm = h24 >= 12 ? 'PM' : 'AM';
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    return `${h12}:${pad(m)} ${ampm}`;
  };
  return `${fmt(startIso)} – ${fmt(endIso)}`;
}

export function formatDateLabel(dateISO: string): string {
  const [y, m, d] = dateISO.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}
