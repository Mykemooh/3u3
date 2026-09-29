import { db } from '@/db/client';
import { crews } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { generateDaySlots, generateUpcomingSlots, type Slot } from '@/lib/scheduling';
import { getBookingsForCrewOnOrAfter } from '@/lib/data';

/**
 * Online booking across every team that takes bookings: a time is offered
 * if any team has it free, and a booking goes to the first team that
 * does. Each team keeps its own hours, homes/day and commute buffer, so
 * slots are generated per team with the existing engine (lib/scheduling)
 * and then merged.
 */

export async function bookableTeams(tenantId: string) {
  return (
    await db
      .select()
      .from(crews)
      .where(and(eq(crews.tenantId, tenantId), eq(crews.acceptsBookings, true)))
  ).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

async function cleaningBookings(crewId: string) {
  return (await getBookingsForCrewOnOrAfter(crewId)).filter((b) => !b.isQuoteVisit);
}

export async function combinedSlots(tenantId: string, durationMinutes: number, days: number, startDate: Date) {
  const teams = await bookableTeams(tenantId);
  const byDate = new Map<string, Map<string, Slot>>();
  for (const team of teams) {
    const existing = await cleaningBookings(team.id);
    for (const day of generateUpcomingSlots(team, durationMinutes, existing, days, startDate)) {
      const slots = byDate.get(day.date) ?? new Map<string, Slot>();
      for (const s of day.slots) {
        const key = `${s.start}|${s.end}`;
        const seen = slots.get(key);
        slots.set(key, { ...s, available: s.available || !!seen?.available });
      }
      byDate.set(day.date, slots);
    }
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, slots]) => ({ date, slots: [...slots.values()].sort((a, b) => a.start.localeCompare(b.start)) }));
}

/**
 * Teams, in booking order, for which this exact window is one of their
 * real, free slots. Empty means nobody can take it (or the window was
 * made up — the engine never trusts a time it didn't generate).
 */
export async function teamsFreeFor(tenantId: string, durationMinutes: number, slotStart: string, slotEnd: string) {
  const date = slotStart.split('T')[0];
  const out = [];
  for (const team of await bookableTeams(tenantId)) {
    const slots = generateDaySlots(team, durationMinutes, date, await cleaningBookings(team.id));
    if (slots.some((s) => s.start === slotStart && s.end === slotEnd && s.available)) out.push(team);
  }
  return out;
}
