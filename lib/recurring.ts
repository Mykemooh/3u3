import { bookingEvent, bookingsCancelled, flushEvents, scheduleChanged } from '@/lib/events';
import { db } from '@/db/client';
import { recurringSeries, bookings, jobs, crews, users, serviceTypes, clientRates, addresses } from '@/db/schema';
import { and, eq, gte, inArray } from 'drizzle-orm';
import { createBooking, DoubleBookingError } from '@/lib/bookings';
import { businessTodayISO } from '@/lib/time';
import { logChange, type Actor } from '@/lib/audit';
import type { Cadence } from '@/lib/cadence';

/**
 * Recurring cleans.
 *
 * A series is a rule ("every other Tuesday at 9:00 with Crew 1") and the
 * visits it creates are ordinary bookings, made a rolling HORIZON_DAYS
 * ahead by the daily cron. Every visit remembers the date the series gave
 * it (bookings.seriesOccurrenceDate, unique per series), which is what
 * makes visit-level edits safe:
 *
 *   - Move or skip ONE visit: only that booking changes. It's marked an
 *     exception, and because its occurrence date is still claimed, the
 *     series never recreates it and never touches the rest.
 *   - Change THIS AND FUTURE visits: the series is split — the old one ends
 *     the day before, a new one starts from that visit with the new
 *     settings — so past visits keep their history exactly as they were.
 *
 * This is the fix for the most-reported recurring-job problem in the
 * roadmap: editing one visit closing or rewriting the whole series.
 */

export const HORIZON_DAYS = 56;

export type Pattern = 'WEEKLY' | 'EVERY_2_WEEKS' | 'EVERY_4_WEEKS' | 'MONTHLY_NTH_WEEKDAY' | 'CUSTOM_WEEKDAYS';

export const PATTERN_LABEL: Record<Pattern, string> = {
  WEEKLY: 'Every week',
  EVERY_2_WEEKS: 'Every 2 weeks',
  EVERY_4_WEEKS: 'Every 4 weeks',
  MONTHLY_NTH_WEEKDAY: 'Monthly',
  CUSTOM_WEEKDAYS: 'Set days each week',
};

const PATTERN_CADENCE: Record<Pattern, Cadence> = {
  WEEKLY: 'WEEKLY',
  EVERY_2_WEEKS: 'BIWEEKLY',
  EVERY_4_WEEKS: 'EVERY_4_WEEKS',
  MONTHLY_NTH_WEEKDAY: 'MONTHLY',
  CUSTOM_WEEKDAYS: 'CUSTOM',
};

export class SeriesError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

// ---- Pure date math (UTC date-only, so no timezone surprises) ------------

const DAY = 86400000;
export const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
export const toISO = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (iso: string, n: number) => toISO(new Date(toDate(iso).getTime() + n * DAY));
const weekday = (iso: string) => toDate(iso).getUTCDay();
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ORDINAL: Record<number, string> = { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth', [-1]: 'last' };

/** The nth (1–4, or -1 = last) given weekday of a month. */
function nthWeekdayOfMonth(year: number, month: number, dow: number, nth: number): string | null {
  if (nth === -1) {
    const last = new Date(Date.UTC(year, month + 1, 0));
    const diff = (last.getUTCDay() - dow + 7) % 7;
    return toISO(new Date(last.getTime() - diff * DAY));
  }
  const first = new Date(Date.UTC(year, month, 1));
  const diff = (dow - first.getUTCDay() + 7) % 7;
  const day = 1 + diff + (nth - 1) * 7;
  const d = new Date(Date.UTC(year, month, day));
  return d.getUTCMonth() === month ? toISO(d) : null;
}

/** Which week of its month a date falls in (1–4), or -1 if it's the last one and the 5th. */
export function nthOfMonth(iso: string): number {
  const n = Math.ceil(toDate(iso).getUTCDate() / 7);
  return n >= 5 ? -1 : n;
}

/** US federal holidays most cleaning companies close for. */
export function usHolidays(year: number): Set<string> {
  const fixed = (m: number, d: number) => toISO(new Date(Date.UTC(year, m, d)));
  return new Set(
    [
      fixed(0, 1),
      nthWeekdayOfMonth(year, 4, 1, -1), // Memorial Day
      fixed(6, 4),
      nthWeekdayOfMonth(year, 8, 1, 1), // Labor Day
      nthWeekdayOfMonth(year, 10, 4, 4), // Thanksgiving
      fixed(11, 24),
      fixed(11, 25),
      fixed(11, 31),
    ].filter(Boolean) as string[],
  );
}

export type Rule = {
  pattern: Pattern;
  startDate: string;
  endDate?: string | null;
  weekdays?: string | null;
  nth?: number | null;
  skipHolidays?: boolean;
};

/** Every date the rule produces between from and to (inclusive). */
export function occurrences(rule: Rule, from: string, to: string): string[] {
  const start = rule.startDate;
  const last = rule.endDate && rule.endDate < to ? rule.endDate : to;
  const lo = from > start ? from : start;
  if (lo > last) return [];
  const out: string[] = [];

  if (rule.pattern === 'WEEKLY' || rule.pattern === 'EVERY_2_WEEKS' || rule.pattern === 'EVERY_4_WEEKS') {
    const step = rule.pattern === 'WEEKLY' ? 7 : rule.pattern === 'EVERY_2_WEEKS' ? 14 : 28;
    const gap = Math.round((toDate(lo).getTime() - toDate(start).getTime()) / DAY);
    let d = addDays(start, Math.ceil(gap / step) * step);
    while (d <= last) {
      out.push(d);
      d = addDays(d, step);
    }
  } else if (rule.pattern === 'CUSTOM_WEEKDAYS') {
    const days = new Set((rule.weekdays ?? String(weekday(start))).split(',').map(Number));
    for (let d = lo; d <= last; d = addDays(d, 1)) if (days.has(weekday(d))) out.push(d);
  } else {
    const dow = weekday(start);
    const nth = rule.nth ?? nthOfMonth(start);
    let y = toDate(lo).getUTCFullYear();
    let m = toDate(lo).getUTCMonth();
    for (let i = 0; i < 240; i += 1) {
      const d = nthWeekdayOfMonth(y, m, dow, nth);
      if (d && d > last) break;
      if (d && d >= lo) out.push(d);
      m += 1;
      if (m > 11) {
        m = 0;
        y += 1;
      }
    }
  }

  if (!rule.skipHolidays) return out;
  const years = new Set(out.map((d) => Number(d.slice(0, 4))));
  const holidays = new Set<string>();
  years.forEach((y) => usHolidays(y).forEach((h) => holidays.add(h)));
  return out.filter((d) => !holidays.has(d));
}

/** "Every 2 weeks on Tuesday at 9:00 AM" */
export function describeRule(rule: Rule & { startMinutes?: number }): string {
  const day = WEEKDAY_NAMES[weekday(rule.startDate)];
  const time = rule.startMinutes != null ? ` at ${minutesLabel(rule.startMinutes)}` : '';
  switch (rule.pattern) {
    case 'WEEKLY':
      return `Every ${day}${time}`;
    case 'EVERY_2_WEEKS':
      return `Every other ${day}${time}`;
    case 'EVERY_4_WEEKS':
      return `Every 4 weeks on ${day}${time}`;
    case 'MONTHLY_NTH_WEEKDAY':
      return `The ${ORDINAL[rule.nth ?? nthOfMonth(rule.startDate)]} ${day} of each month${time}`;
    case 'CUSTOM_WEEKDAYS': {
      const names = (rule.weekdays ?? '').split(',').filter(Boolean).map((d) => WEEKDAY_NAMES[Number(d)].slice(0, 3));
      return `Every ${names.join(', ')}${time}`;
    }
  }
}

export function minutesLabel(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

const slotAt = (date: string, minutes: number) =>
  `${date}T${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:00`;

// ---- Database --------------------------------------------------------------

export type Series = typeof recurringSeries.$inferSelect;

export type CreateSeriesInput = {
  tenantId: string;
  clientId: string;
  serviceTypeId: string;
  addressId?: string | null;
  crewId: string;
  pattern: Pattern;
  startDate: string;
  endDate?: string | null;
  weekdays?: string | null;
  nth?: number | null;
  startMinutes: number;
  durationMinutes: number;
  priceCents?: number | null;
  templateId?: string | null;
  notes?: string | null;
  skipHolidays?: boolean;
};

async function validate(input: CreateSeriesInput) {
  const [client, crew, service] = await Promise.all([
    db.select().from(users).where(eq(users.id, input.clientId)).limit(1),
    db.select().from(crews).where(eq(crews.id, input.crewId)).limit(1),
    db.select().from(serviceTypes).where(eq(serviceTypes.id, input.serviceTypeId)).limit(1),
  ]);
  if (!client[0] || client[0].tenantId !== input.tenantId || client[0].role !== 'CUSTOMER') throw new SeriesError('Client not found.', 404);
  if (!crew[0] || crew[0].tenantId !== input.tenantId) throw new SeriesError('Team not found.', 404);
  if (!service[0] || service[0].tenantId !== input.tenantId) throw new SeriesError('Service not found.', 404);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate)) throw new SeriesError('Pick a start date.');
  if (input.endDate && input.endDate < input.startDate) throw new SeriesError('The end date is before the start date.');
  if (input.startMinutes < 0 || input.startMinutes + input.durationMinutes > 24 * 60) throw new SeriesError('That time runs past midnight.');
  if (input.durationMinutes < 15) throw new SeriesError('A clean needs at least 15 minutes.');
  if (input.pattern === 'CUSTOM_WEEKDAYS' && !(input.weekdays ?? '').split(',').filter(Boolean).length) {
    throw new SeriesError('Pick at least one day of the week.');
  }
  let addressId = input.addressId ?? null;
  if (!addressId) {
    const primary = (await db.select().from(addresses).where(eq(addresses.userId, input.clientId)))[0];
    addressId = primary?.id ?? null;
  }
  let priceCents = input.priceCents ?? null;
  if (priceCents == null) {
    const rate = (await db.select().from(clientRates).where(and(eq(clientRates.userId, input.clientId), eq(clientRates.serviceTypeId, input.serviceTypeId))).limit(1))[0];
    priceCents = rate?.rateCents ?? null;
  }
  return { client: client[0], crew: crew[0], service: service[0], addressId, priceCents };
}

/**
 * Creates a series and its first HORIZON_DAYS of visits. Visits that would
 * clash with something already on that team's calendar are reported, not
 * forced — the admin moves them, or picks another team.
 */
export async function createSeries(input: CreateSeriesInput, actor?: Actor) {
  const v = await validate(input);
  const id = crypto.randomUUID();
  await db.insert(recurringSeries).values({
    id,
    tenantId: input.tenantId,
    clientId: input.clientId,
    serviceTypeId: input.serviceTypeId,
    addressId: v.addressId,
    crewId: input.crewId,
    pattern: input.pattern,
    weekdays: input.pattern === 'CUSTOM_WEEKDAYS' ? input.weekdays ?? null : null,
    nth: input.pattern === 'MONTHLY_NTH_WEEKDAY' ? input.nth ?? nthOfMonth(input.startDate) : null,
    startDate: input.startDate,
    endDate: input.endDate ?? null,
    startMinutes: input.startMinutes,
    durationMinutes: input.durationMinutes,
    priceCents: v.priceCents,
    templateId: input.templateId ?? null,
    notes: input.notes ?? null,
    skipHolidays: !!input.skipHolidays,
  });
  const result = await generateVisits(id);
  const series = (await db.select().from(recurringSeries).where(eq(recurringSeries.id, id)).limit(1))[0]!;
  await logChange({
    tenantId: input.tenantId,
    actor,
    entityType: 'series',
    entityId: id,
    action: 'created',
    summary: `Started a recurring clean for ${v.client.name}: ${describeRule({ ...series, startMinutes: series.startMinutes })}`,
  });
  return { series, ...result };
}

/**
 * Makes sure every visit the series should have, through `through`, exists.
 * Never recreates a date the series already claimed (moved, skipped or
 * cancelled ones included).
 */
export async function generateVisits(seriesId: string, through?: string) {
  const series = (await db.select().from(recurringSeries).where(eq(recurringSeries.id, seriesId)).limit(1))[0];
  if (!series) throw new SeriesError('Series not found.', 404);
  if (series.status !== 'ACTIVE') return { created: [] as string[], conflicts: [] as string[] };

  const today = businessTodayISO();
  const until = through ?? addDays(today, HORIZON_DAYS);
  const from = series.startDate > today ? series.startDate : today;
  const dates = occurrences(series, from, until);
  const claimed = new Set(
    (await db.select({ d: bookings.seriesOccurrenceDate }).from(bookings).where(eq(bookings.seriesId, seriesId))).map((r) => r.d),
  );

  const created: string[] = [];
  const conflicts: string[] = [];
  for (const date of dates) {
    if (claimed.has(date)) continue;
    try {
      const bookingId = await createBooking({
        tenantId: series.tenantId,
        clientId: series.clientId,
        serviceTypeId: series.serviceTypeId,
        crewId: series.crewId,
        addressId: series.addressId ?? undefined,
        slotStart: slotAt(date, series.startMinutes),
        slotEnd: slotAt(date, series.startMinutes + series.durationMinutes),
        cadence: PATTERN_CADENCE[series.pattern],
        priceCents: series.priceCents ?? undefined,
        seriesId: series.id,
        seriesOccurrenceDate: date,
        clientNotes: series.notes,
      });
      created.push(bookingId);
    } catch (err) {
      if (err instanceof DoubleBookingError || (err as { code?: string; cause?: { code?: string } })?.cause?.code === '23505') {
        conflicts.push(date);
        continue;
      }
      throw err;
    }
  }
  if (!series.generatedThrough || until > series.generatedThrough) {
    await db.update(recurringSeries).set({ generatedThrough: until }).where(eq(recurringSeries.id, seriesId));
  }
  // booking.created webhooks were queued per visit; send them together.
  if (created.length) {
    await flushEvents(series.tenantId);
    await scheduleChanged(series.tenantId);
  }
  return { created, conflicts };
}

/** The daily cron: keep every active series HORIZON_DAYS ahead. */
export async function extendAllSeries() {
  const active = await db.select().from(recurringSeries).where(eq(recurringSeries.status, 'ACTIVE'));
  let created = 0;
  const conflicts: { seriesId: string; dates: string[] }[] = [];
  for (const s of active) {
    const r = await generateVisits(s.id);
    created += r.created.length;
    if (r.conflicts.length) conflicts.push({ seriesId: s.id, dates: r.conflicts });
  }
  return { series: active.length, created, conflicts };
}

/** Visits of a series that haven't started yet, from a date on. */
async function unstartedVisits(seriesId: string, fromDate: string) {
  const rows = await db
    .select()
    .from(bookings)
    .where(and(eq(bookings.seriesId, seriesId), gte(bookings.seriesOccurrenceDate, fromDate)));
  const live = rows.filter((b) => b.status !== 'CANCELLED' && b.status !== 'COMPLETED');
  if (!live.length) return [];
  const jobRows = await db.select().from(jobs).where(inArray(jobs.bookingId, live.map((b) => b.id)));
  const started = new Set(jobRows.filter((j) => j.status !== 'PENDING').map((j) => j.bookingId));
  return live.filter((b) => !started.has(b.id));
}

/** Skip one visit. The rest of the series is untouched. */
export async function skipVisit(tenantId: string, bookingId: string, actor?: Actor) {
  const booking = (await db.select().from(bookings).where(and(eq(bookings.id, bookingId), eq(bookings.tenantId, tenantId))).limit(1))[0];
  if (!booking) throw new SeriesError('Visit not found.', 404);
  if (booking.status === 'CANCELLED' || booking.status === 'COMPLETED') throw new SeriesError(`This visit is already ${booking.status.toLowerCase()}.`);
  const job = (await db.select().from(jobs).where(eq(jobs.bookingId, bookingId)).limit(1))[0];
  if (job && job.status !== 'PENDING') throw new SeriesError('This visit has already started.');
  await db.update(bookings).set({ status: 'CANCELLED', isSeriesException: true }).where(eq(bookings.id, bookingId));
  await bookingEvent('booking.cancelled', bookingId);
  await scheduleChanged(tenantId);
  await logChange({ tenantId, actor, entityType: booking.seriesId ? 'series' : 'booking', entityId: booking.seriesId ?? booking.id, action: 'visit_skipped', summary: `Skipped the visit on ${booking.slotStart.slice(0, 10)}` });
  return booking;
}

export type FutureChange = {
  startMinutes?: number;
  durationMinutes?: number;
  crewId?: string;
  priceCents?: number | null;
  pattern?: Pattern;
  weekdays?: string | null;
  /** Move the whole rhythm to a new first date (e.g. Tuesdays → Thursdays). */
  newStartDate?: string;
  notes?: string | null;
};

/**
 * "This visit and every one after it": ends the old series the day before
 * the chosen visit, starts a new one from there with the changes, and
 * replaces the old series' upcoming unstarted visits. Visits already done
 * or underway are never touched.
 */
export async function changeFuture(tenantId: string, seriesId: string, fromDate: string, change: FutureChange, actor?: Actor) {
  const old = (await db.select().from(recurringSeries).where(and(eq(recurringSeries.id, seriesId), eq(recurringSeries.tenantId, tenantId))).limit(1))[0];
  if (!old) throw new SeriesError('Series not found.', 404);
  if (old.status === 'ENDED') throw new SeriesError('This series has ended.');

  const startDate = change.newStartDate ?? fromDate;
  const replaced = await unstartedVisits(seriesId, fromDate);
  if (replaced.length) {
    await db.update(bookings).set({ status: 'CANCELLED' }).where(inArray(bookings.id, replaced.map((b) => b.id)));
    await bookingsCancelled(tenantId, replaced.map((b) => b.id));
  }

  const isFirst = fromDate <= old.startDate;
  if (isFirst) {
    await db.update(recurringSeries).set({ status: 'ENDED' }).where(eq(recurringSeries.id, seriesId));
  } else {
    await db.update(recurringSeries).set({ endDate: addDays(fromDate, -1) }).where(eq(recurringSeries.id, seriesId));
  }

  const result = await createSeries(
    {
      tenantId,
      clientId: old.clientId,
      serviceTypeId: old.serviceTypeId,
      addressId: old.addressId,
      crewId: change.crewId ?? old.crewId,
      pattern: change.pattern ?? old.pattern,
      weekdays: change.weekdays !== undefined ? change.weekdays : old.weekdays,
      nth: (change.pattern ?? old.pattern) === 'MONTHLY_NTH_WEEKDAY' ? nthOfMonth(startDate) : null,
      startDate,
      endDate: old.endDate && old.endDate >= startDate ? old.endDate : null,
      startMinutes: change.startMinutes ?? old.startMinutes,
      durationMinutes: change.durationMinutes ?? old.durationMinutes,
      priceCents: change.priceCents !== undefined ? change.priceCents : old.priceCents,
      templateId: old.templateId,
      notes: change.notes !== undefined ? change.notes : old.notes,
      skipHolidays: old.skipHolidays,
    },
    actor,
  );
  await logChange({
    tenantId,
    actor,
    entityType: 'series',
    entityId: seriesId,
    action: 'split',
    summary: `Changed every visit from ${fromDate} on (continues as a new schedule)`,
    changes: Object.entries(change).map(([field, to]) => ({ field, from: (old as unknown as Record<string, unknown>)[field] ?? null, to })),
  });
  return { newSeries: result.series, replaced: replaced.length, created: result.created.length, conflicts: result.conflicts };
}

/** Pause (keeps the rule, removes upcoming unstarted visits) or end a series. */
export async function setSeriesStatus(tenantId: string, seriesId: string, status: 'ACTIVE' | 'PAUSED' | 'ENDED', actor?: Actor) {
  const series = (await db.select().from(recurringSeries).where(and(eq(recurringSeries.id, seriesId), eq(recurringSeries.tenantId, tenantId))).limit(1))[0];
  if (!series) throw new SeriesError('Series not found.', 404);
  const today = businessTodayISO();
  let removed = 0;
  if (status !== 'ACTIVE') {
    const upcoming = await unstartedVisits(seriesId, today);
    if (upcoming.length) {
      await db.update(bookings).set({ status: 'CANCELLED' }).where(inArray(bookings.id, upcoming.map((b) => b.id)));
      await bookingsCancelled(tenantId, upcoming.map((b) => b.id));
      await scheduleChanged(tenantId);
    }
    removed = upcoming.length;
  }
  await db
    .update(recurringSeries)
    .set({ status, ...(status === 'ENDED' ? { endDate: series.endDate && series.endDate < today ? series.endDate : today } : {}) })
    .where(eq(recurringSeries.id, seriesId));
  let created = 0;
  if (status === 'ACTIVE') created = (await generateVisits(seriesId)).created.length;
  await logChange({
    tenantId,
    actor,
    entityType: 'series',
    entityId: seriesId,
    action: status.toLowerCase(),
    summary: status === 'ACTIVE' ? 'Resumed the recurring clean' : status === 'PAUSED' ? 'Paused the recurring clean' : 'Ended the recurring clean',
  });
  return { removed, created };
}

export async function listSeries(tenantId: string) {
  const rows = await db.select().from(recurringSeries).where(eq(recurringSeries.tenantId, tenantId));
  const clientIds = [...new Set(rows.map((r) => r.clientId))];
  const [clients, crewRows, services] = await Promise.all([
    clientIds.length ? db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, clientIds)) : [],
    db.select().from(crews).where(eq(crews.tenantId, tenantId)),
    db.select().from(serviceTypes).where(eq(serviceTypes.tenantId, tenantId)),
  ]);
  const today = businessTodayISO();
  const upcoming = rows.length
    ? await db.select().from(bookings).where(and(inArray(bookings.seriesId, rows.map((r) => r.id)), gte(bookings.slotStart, today)))
    : [];
  return rows
    .map((s) => {
      const next = upcoming
        .filter((b) => b.seriesId === s.id && b.status !== 'CANCELLED')
        .sort((a, b) => a.slotStart.localeCompare(b.slotStart))[0];
      return {
        ...s,
        clientName: clients.find((c) => c.id === s.clientId)?.name ?? 'Client',
        crewName: crewRows.find((c) => c.id === s.crewId)?.name ?? 'Team',
        serviceName: services.find((x) => x.id === s.serviceTypeId)?.name ?? 'Clean',
        describe: describeRule({ ...s }),
        nextVisit: next?.slotStart ?? null,
      };
    })
    .sort((a, b) => (a.status === b.status ? a.clientName.localeCompare(b.clientName) : a.status === 'ACTIVE' ? -1 : 1));
}

export async function getSeriesDetail(tenantId: string, seriesId: string) {
  const series = (await db.select().from(recurringSeries).where(and(eq(recurringSeries.id, seriesId), eq(recurringSeries.tenantId, tenantId))).limit(1))[0];
  if (!series) return null;
  const visits = (await db.select().from(bookings).where(eq(bookings.seriesId, seriesId))).sort((a, b) => a.slotStart.localeCompare(b.slotStart));
  const jobRows = visits.length ? await db.select().from(jobs).where(inArray(jobs.bookingId, visits.map((v) => v.id))) : [];
  const [client, crew, service] = await Promise.all([
    db.select().from(users).where(eq(users.id, series.clientId)).limit(1),
    db.select().from(crews).where(eq(crews.id, series.crewId)).limit(1),
    db.select().from(serviceTypes).where(eq(serviceTypes.id, series.serviceTypeId)).limit(1),
  ]);
  return {
    series,
    describe: describeRule({ ...series, startMinutes: undefined }),
    client: client[0],
    crew: crew[0],
    service: service[0],
    visits: visits.map((v) => ({ ...v, jobStatus: jobRows.find((j) => j.bookingId === v.id)?.status ?? null, jobId: jobRows.find((j) => j.bookingId === v.id)?.id ?? null })),
  };
}
