import { db } from '@/db/client';
import { bookings, crews, addresses } from '@/db/schema';
import { and, eq, gte, inArray, lte, ne } from 'drizzle-orm';
import { addDays, minutesLabel } from '@/lib/recurring';
import { businessTodayISO } from '@/lib/time';

/**
 * Find a Time: open slots across every team for a clean of a given length,
 * ranked so the best fit for the business comes first —
 *   - days a team is already working near that ZIP (tighter routes),
 *   - close to the client's preferred start,
 *   - sooner rather than later.
 * Gaps respect each team's working hours and its travel buffer between
 * homes. Nothing is booked; the admin picks one.
 */

export type Suggestion = {
  crewId: string;
  crewName: string;
  date: string;
  startMinutes: number;
  endMinutes: number;
  label: string;
  reasons: string[];
  score: number;
};

const toMin = (slot: string) => {
  const [h, m] = slot.slice(11, 16).split(':').map(Number);
  return h * 60 + m;
};

export function freeGaps(
  workStart: number,
  workEnd: number,
  buffer: number,
  busy: { start: number; end: number }[],
): { start: number; end: number }[] {
  const sorted = [...busy].sort((a, b) => a.start - b.start);
  const gaps: { start: number; end: number }[] = [];
  let cursor = workStart;
  for (const b of sorted) {
    const gapEnd = b.start - buffer;
    if (gapEnd > cursor) gaps.push({ start: cursor, end: gapEnd });
    cursor = Math.max(cursor, b.end + buffer);
  }
  if (workEnd > cursor) gaps.push({ start: cursor, end: workEnd });
  return gaps;
}

export async function findATime(input: {
  tenantId: string;
  durationMinutes: number;
  zip?: string | null;
  preferredStartMinutes?: number | null;
  fromDate?: string;
  days?: number;
  crewId?: string | null;
  limit?: number;
}): Promise<Suggestion[]> {
  const from = input.fromDate ?? addDays(businessTodayISO(), 1);
  const to = addDays(from, (input.days ?? 14) - 1);
  const teamRows = await db.select().from(crews).where(eq(crews.tenantId, input.tenantId));
  const teams = input.crewId ? teamRows.filter((t) => t.id === input.crewId) : teamRows;
  if (!teams.length) return [];

  const rows = await db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.tenantId, input.tenantId),
        ne(bookings.status, 'CANCELLED'),
        eq(bookings.isQuoteVisit, false),
        gte(bookings.slotStart, from),
        lte(bookings.slotStart, `${to}T23:59:59`),
      ),
    );
  const addrIds = [...new Set(rows.map((r) => r.addressId).filter(Boolean))] as string[];
  const zips = new Map(
    (addrIds.length ? await db.select({ id: addresses.id, zip: addresses.zip }).from(addresses).where(inArray(addresses.id, addrIds)) : []).map((a) => [a.id, a.zip]),
  );

  const zip = input.zip?.trim().slice(0, 5) || null;
  const pref = input.preferredStartMinutes ?? null;
  const out: Suggestion[] = [];

  for (const team of teams) {
    for (let i = 0, date = from; date <= to; i += 1, date = addDays(from, i)) {
      const dayRows = rows.filter((r) => r.crewId === team.id && r.slotStart.startsWith(date));
      if (dayRows.length >= team.homesPerDay) continue;
      const busy = dayRows.map((r) => ({ start: toMin(r.slotStart), end: toMin(r.slotEnd) }));
      const gaps = freeGaps(team.workStartMinutes, team.workEndMinutes, team.commuteBufferMinutes, busy);
      const dayZips = dayRows.map((r) => (r.addressId ? zips.get(r.addressId) : null)).filter(Boolean) as string[];
      const sameZip = !!zip && dayZips.some((z) => z.slice(0, 5) === zip);
      const nearZip = !!zip && !sameZip && dayZips.some((z) => z.slice(0, 3) === zip.slice(0, 3));

      for (const gap of gaps) {
        if (gap.end - gap.start < input.durationMinutes) continue;
        // Within a gap, the best start is the preferred time if it fits,
        // otherwise as close to it as the gap allows (or the gap's start).
        let start = gap.start;
        if (pref != null) start = Math.min(Math.max(pref, gap.start), gap.end - input.durationMinutes);
        start = Math.ceil(start / 15) * 15;
        if (start + input.durationMinutes > gap.end) start = gap.start;
        const reasons: string[] = [];
        let score = 100 - i * 2;
        if (sameZip) {
          score += 40;
          reasons.push(`${team.name} is already in ${zip} that day`);
        } else if (nearZip) {
          score += 20;
          reasons.push(`${team.name} is working nearby that day`);
        }
        if (pref != null) {
          const off = Math.abs(start - pref);
          score -= off / 15;
          if (off === 0) reasons.push('Right at the preferred time');
        }
        if (dayRows.length === 0) reasons.push(`${team.name}'s first home of the day`);
        out.push({
          crewId: team.id,
          crewName: team.name,
          date,
          startMinutes: start,
          endMinutes: start + input.durationMinutes,
          label: `${minutesLabel(start)} – ${minutesLabel(start + input.durationMinutes)}`,
          reasons,
          score,
        });
      }
    }
  }
  return out.sort((a, b) => b.score - a.score || a.date.localeCompare(b.date)).slice(0, input.limit ?? 8);
}
