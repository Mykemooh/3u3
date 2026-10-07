import { db } from '@/db/client';
import { jobTrips, jobs, bookings, expenses, crews, users } from '@/db/schema';
import { and, asc, eq, gte, inArray, isNull, lte } from 'drizzle-orm';
import { JobError, requireWorkable, type Viewer } from '@/lib/jobs';
import { verifyRouteChoice, type RouteChoice } from '@/lib/directions';
import { routeSummaryLine } from '@/lib/routeOptions';
import { logChange } from '@/lib/audit';
import { businessLocalToUtc, businessTodayISO } from '@/lib/time';

/**
 * The drive to each job, kept for reporting (Admin → Reports → Travel) and
 * for tolls (Admin → Expenses). One row per job:
 *
 * - "Start driving" (lib/tracking.ts) opens it with the live map's own
 *   route estimate, if the phone gave a position.
 * - Starting in-app navigation (components/crew/CrewDirectionsMap.tsx)
 *   opens it or replaces its route with the one the crew picked — and if
 *   that route has a known toll price, adds one "Tolls" expense for it.
 *   Picking again before arriving updates that same expense (or removes it
 *   for a toll-free route); retries never add a second one.
 * - Arrival (the map seeing them arrive, or "I've arrived — start job",
 *   lib/jobs.ts) closes it with the actual drive time. After that it's
 *   frozen.
 *
 * Nothing here may break the trip itself: callers in the job flow catch and
 * log failures.
 */

export const TOLL_EXPENSE_CATEGORY = 'Tolls';

/** A drive longer than this isn't a real "drive to the job" (left open overnight, etc.). */
const MAX_TRIP_SECONDS = 4 * 3600;

type TripFields = Pick<
  typeof jobTrips.$inferInsert,
  'provider' | 'routeLabel' | 'routeSummary' | 'plannedDistanceMeters' | 'plannedDurationSeconds' | 'tollState' | 'tollCents' | 'tollPass' | 'avoidTollsOn' | 'avoidedTolls'
>;

/** The signed route choice → the trip's route columns. */
export function tripFieldsFromChoice(c: RouteChoice): TripFields {
  const tollState = c.toll.kind === 'priced' ? 'PRICED' : c.toll.kind === 'unpriced' ? 'UNPRICED' : 'NONE';
  return {
    provider: c.provider,
    routeLabel: c.label,
    routeSummary: routeSummaryLine(c),
    plannedDistanceMeters: Math.round(c.distanceMeters),
    plannedDurationSeconds: Math.round(c.durationSeconds),
    tollState,
    tollCents: c.toll.kind === 'priced' ? c.toll.cents : null,
    tollPass: c.tollPass,
    avoidTollsOn: c.avoidTolls,
    avoidedTolls: tollState === 'NONE' && (c.avoidTolls || c.tollsOffered),
  };
}

/** Seconds from start to arrival, or null when it isn't a believable drive. */
export function actualDriveSeconds(startedAt: Date, arrivedAt: Date): number | null {
  const s = Math.round((arrivedAt.getTime() - startedAt.getTime()) / 1000);
  return s >= 30 && s <= MAX_TRIP_SECONDS ? s : null;
}

async function tripContext(job: { bookingId: string }) {
  const booking = (await db.select({ tenantId: bookings.tenantId, clientId: bookings.clientId }).from(bookings).where(eq(bookings.id, job.bookingId)).limit(1))[0];
  if (!booking) throw new JobError('Job not found', 404);
  return booking;
}

async function openTrip(
  job: { id: string; crewId: string; bookingId: string },
  tenantId: string,
  driverUserId: string | null,
  startedAt: Date,
  extra: Partial<typeof jobTrips.$inferInsert> = {},
) {
  await db
    .insert(jobTrips)
    .values({ id: crypto.randomUUID(), tenantId, jobId: job.id, crewId: job.crewId, driverUserId, startedAt, ...extra })
    .onConflictDoNothing({ target: jobTrips.jobId });
  return (await db.select().from(jobTrips).where(eq(jobTrips.jobId, job.id)).limit(1))[0]!;
}

/**
 * "Start driving": make sure the trip exists. `planned` is the live map's
 * route (lib/tracking.ts) — only used if no route was picked in the app.
 */
export async function ensureTripStarted(
  job: { id: string; crewId: string; bookingId: string },
  driverUserId: string | null,
  startedAt: Date,
  planned: { distanceMeters: number | null; durationSeconds: number | null } | null,
) {
  const { tenantId } = await tripContext(job);
  const hasPlan = !!planned && (planned.distanceMeters != null || planned.durationSeconds != null);
  const trip = await openTrip(job, tenantId, driverUserId, startedAt, {
    provider: hasPlan ? 'tracking' : 'none',
    plannedDistanceMeters: planned?.distanceMeters ?? null,
    plannedDurationSeconds: planned?.durationSeconds ?? null,
  });
  // Already open (navigation started first): just fill in what's missing.
  if (hasPlan && trip.provider === 'none' && !trip.arrivedAt) {
    await db
      .update(jobTrips)
      .set({ provider: 'tracking', plannedDistanceMeters: planned!.distanceMeters, plannedDurationSeconds: planned!.durationSeconds })
      .where(eq(jobTrips.id, trip.id));
  }
  return trip.id;
}

export type TollExpenseResult = 'added' | 'updated' | 'removed' | 'unchanged';

/**
 * The crew started navigating on a route they picked: record it, and its
 * toll expense. `choiceToken` is the server-signed route (lib/directions.ts).
 */
export async function recordTripRoute(jobId: string, viewer: Viewer | null, choiceToken: unknown) {
  const job = await requireWorkable(jobId, viewer);
  const choice = verifyRouteChoice(choiceToken, jobId);
  if (!choice) throw new JobError('That route is out of date — reload directions and pick it again.', 400);
  // Already on site or done: a drive now isn't the drive to this job.
  if (job.status === 'IN_PROGRESS' || job.status === 'COMPLETE') return { recorded: false as const, tollExpense: 'unchanged' as TollExpenseResult };

  const { tenantId, clientId } = await tripContext(job);
  const trip = await openTrip(job, tenantId, viewer!.id, new Date());
  if (trip.arrivedAt) return { recorded: false as const, tollExpense: 'unchanged' as TollExpenseResult };

  const fields = tripFieldsFromChoice(choice);
  await db.update(jobTrips).set({ ...fields, driverUserId: viewer!.id }).where(and(eq(jobTrips.id, trip.id), isNull(jobTrips.arrivedAt)));

  const [driver, client] = await Promise.all([
    db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, viewer!.id)).limit(1).then((r) => r[0]),
    db.select({ name: users.name }).from(users).where(eq(users.id, clientId)).limit(1).then((r) => r[0]),
  ]);
  const tollExpense = await syncTollExpense({
    tripId: trip.id,
    tenantId,
    jobId,
    crewId: job.crewId,
    fields,
    actor: { id: viewer!.id, name: driver?.name ?? 'Crew' },
    clientName: client?.name ?? null,
  });
  return { recorded: true as const, tollExpense };
}

/** The note on an auto-added toll expense. */
export function tollExpenseNote(routeSummary: string | null | undefined, clientName: string | null) {
  return [clientName ? `Drive to ${clientName}` : 'Drive to a job', routeSummary, 'added from the crew app'].filter(Boolean).join(' · ').slice(0, 1000);
}

/**
 * Keeps exactly one "Tolls" expense per trip in step with the picked
 * route. The trip row is locked for the duration, so two retries arriving
 * together can't both add one. An expense an admin deleted stays deleted.
 */
export async function syncTollExpense(input: {
  tripId: string;
  tenantId: string;
  jobId: string;
  crewId: string;
  fields: TripFields;
  actor: { id: string; name: string };
  clientName: string | null;
}): Promise<TollExpenseResult> {
  const { fields } = input;
  const amountCents = fields.tollState === 'PRICED' ? fields.tollCents ?? 0 : 0;
  const want = amountCents > 0;
  const result = await db.transaction(async (tx) => {
    const cur = (await tx.select().from(jobTrips).where(eq(jobTrips.id, input.tripId)).for('update'))[0];
    if (!cur || cur.arrivedAt) return { kind: 'unchanged' as const };
    const vendor = fields.tollPass ? `Tolls (${fields.tollPass})` : 'Tolls';
    const notes = tollExpenseNote(fields.routeSummary, input.clientName);
    if (want && !cur.tollExpenseId) {
      const id = crypto.randomUUID();
      await tx.insert(expenses).values({
        id,
        tenantId: input.tenantId,
        spentOn: businessTodayISO(cur.startedAt),
        category: TOLL_EXPENSE_CATEGORY,
        vendor,
        amountCents,
        notes,
        jobId: input.jobId,
        crewId: input.crewId,
        createdByUserId: input.actor.id,
      });
      await tx.update(jobTrips).set({ tollExpenseId: id }).where(eq(jobTrips.id, cur.id));
      return { kind: 'added' as const, id };
    }
    if (want && cur.tollExpenseId) {
      await tx
        .update(expenses)
        .set({ amountCents, vendor, notes })
        .where(and(eq(expenses.id, cur.tollExpenseId), eq(expenses.tenantId, input.tenantId)));
      return { kind: 'updated' as const, id: cur.tollExpenseId };
    }
    if (!want && cur.tollExpenseId) {
      await tx.delete(expenses).where(and(eq(expenses.id, cur.tollExpenseId), eq(expenses.tenantId, input.tenantId)));
      await tx.update(jobTrips).set({ tollExpenseId: null }).where(eq(jobTrips.id, cur.id));
      return { kind: 'removed' as const, id: cur.tollExpenseId };
    }
    return { kind: 'unchanged' as const };
  });
  if (result.kind === 'added' || result.kind === 'removed') {
    await logChange({
      tenantId: input.tenantId,
      actor: input.actor,
      entityType: 'expense',
      entityId: result.id,
      action: result.kind === 'added' ? 'created' : 'deleted',
      summary: result.kind === 'added' ? `Toll recorded from the crew app — $${(amountCents / 100).toFixed(2)}` : 'Toll removed — the crew switched to a toll-free route',
    });
  }
  return result.kind;
}

/** The crew got there: close the trip with its real drive time. Idempotent — the first arrival wins. */
export async function markTripArrived(jobId: string, at: Date, source: 'map' | 'job_start') {
  const trip = (await db.select().from(jobTrips).where(eq(jobTrips.jobId, jobId)).limit(1))[0];
  if (!trip || trip.arrivedAt) return false;
  await db
    .update(jobTrips)
    .set({ arrivedAt: at, arrivalSource: source, actualDurationSeconds: actualDriveSeconds(trip.startedAt, at) })
    .where(and(eq(jobTrips.id, trip.id), isNull(jobTrips.arrivedAt)));
  return true;
}

/** Arrival reported by the crew's in-app navigation. */
export async function recordArrivalFromMap(jobId: string, viewer: Viewer | null) {
  await requireWorkable(jobId, viewer);
  return markTripArrived(jobId, new Date(), 'map');
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

export type TripRow = {
  crewId: string;
  crewName: string;
  plannedDistanceMeters: number | null;
  plannedDurationSeconds: number | null;
  actualDurationSeconds: number | null;
  tollState: string;
  tollCents: number | null;
  avoidedTolls: boolean;
};

export type TravelSummary = {
  crewId: string | null;
  name: string;
  trips: number;
  miles: number;
  driveMinutes: number;
  averageTripMinutes: number | null;
  tollsCents: number;
  tollTrips: number;
  unpricedTollTrips: number;
  /** Of the trips where tolls were an option, the share that went toll-free (null if tolls never came up). */
  avoidedPct: number | null;
  plannedMinutes: number | null;
  actualMinutes: number | null;
  /** Trips with both a plan and an actual time. */
  comparedTrips: number;
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

/** Pure roll-up of trips into one summary line (for a team, or everyone). */
export function summarizeTrips(rows: TripRow[], crewId: string | null, name: string): TravelSummary {
  const meters = rows.reduce((s, r) => s + (r.plannedDistanceMeters ?? 0), 0);
  const driveSeconds = rows.reduce((s, r) => s + (r.actualDurationSeconds ?? r.plannedDurationSeconds ?? 0), 0);
  const actuals = rows.map((r) => r.actualDurationSeconds).filter((s): s is number => s != null);
  const tollRows = rows.filter((r) => r.tollState === 'PRICED' || r.tollState === 'UNPRICED');
  const avoided = rows.filter((r) => r.avoidedTolls).length;
  const choices = avoided + tollRows.length;
  const compared = rows.filter((r) => r.actualDurationSeconds != null && r.plannedDurationSeconds != null);
  const planned = mean(compared.map((r) => r.plannedDurationSeconds! / 60));
  const actual = mean(compared.map((r) => r.actualDurationSeconds! / 60));
  return {
    crewId,
    name,
    trips: rows.length,
    miles: round1(meters / 1609.344),
    driveMinutes: Math.round(driveSeconds / 60),
    averageTripMinutes: actuals.length ? round1(mean(actuals)! / 60) : null,
    tollsCents: rows.reduce((s, r) => s + (r.tollState === 'PRICED' ? r.tollCents ?? 0 : 0), 0),
    tollTrips: tollRows.length,
    unpricedTollTrips: tollRows.filter((r) => r.tollState === 'UNPRICED').length,
    avoidedPct: choices ? Math.round((avoided / choices) * 100) : null,
    plannedMinutes: planned == null ? null : round1(planned),
    actualMinutes: actual == null ? null : round1(actual),
    comparedTrips: compared.length,
  };
}

/** Per team, plus everyone, for trips started in [from, to] (business days, inclusive). */
export function summarizeByTeam(rows: TripRow[]) {
  const byCrew = new Map<string, TripRow[]>();
  for (const r of rows) byCrew.set(r.crewId, [...(byCrew.get(r.crewId) ?? []), r]);
  const teams = Array.from(byCrew.entries())
    .map(([crewId, rs]) => summarizeTrips(rs, crewId, rs[0].crewName))
    .sort((a, b) => b.trips - a.trips || a.name.localeCompare(b.name));
  return { total: summarizeTrips(rows, null, 'All teams'), teams };
}

export async function travelReport(tenantId: string, from: string, to: string) {
  const fromTs = businessLocalToUtc(`${from}T00:00:00`);
  const toTs = businessLocalToUtc(`${to}T23:59:59`);
  const rows = await db
    .select({
      crewId: jobTrips.crewId,
      crewName: crews.name,
      plannedDistanceMeters: jobTrips.plannedDistanceMeters,
      plannedDurationSeconds: jobTrips.plannedDurationSeconds,
      actualDurationSeconds: jobTrips.actualDurationSeconds,
      tollState: jobTrips.tollState,
      tollCents: jobTrips.tollCents,
      avoidedTolls: jobTrips.avoidedTolls,
    })
    .from(jobTrips)
    .innerJoin(jobs, eq(jobs.id, jobTrips.jobId))
    .leftJoin(crews, and(eq(crews.id, jobTrips.crewId), eq(crews.tenantId, tenantId)))
    .where(and(eq(jobTrips.tenantId, tenantId), gte(jobTrips.startedAt, fromTs), lte(jobTrips.startedAt, toTs)));
  return summarizeByTeam(rows.map((r) => ({ ...r, crewName: r.crewName ?? 'Removed team' })));
}

/** Every trip in the range, one line each — the Trips CSV (Admin → Reports). */
export async function tripExportRows(tenantId: string, from: string, to: string) {
  const fromTs = businessLocalToUtc(`${from}T00:00:00`);
  const toTs = businessLocalToUtc(`${to}T23:59:59`);
  const rows = await db
    .select({ trip: jobTrips, crewName: crews.name, clientId: bookings.clientId })
    .from(jobTrips)
    .innerJoin(jobs, eq(jobs.id, jobTrips.jobId))
    .innerJoin(bookings, and(eq(bookings.id, jobs.bookingId), eq(bookings.tenantId, tenantId)))
    .leftJoin(crews, and(eq(crews.id, jobTrips.crewId), eq(crews.tenantId, tenantId)))
    .where(and(eq(jobTrips.tenantId, tenantId), gte(jobTrips.startedAt, fromTs), lte(jobTrips.startedAt, toTs)))
    .orderBy(asc(jobTrips.startedAt));
  const ids = Array.from(new Set(rows.flatMap((r) => [r.clientId, r.trip.driverUserId]).filter((x): x is string => !!x)));
  const people = ids.length ? await db.select({ id: users.id, name: users.name }).from(users).where(and(inArray(users.id, ids), eq(users.tenantId, tenantId))) : [];
  const nameOf = (id: string | null) => (id ? people.find((p) => p.id === id)?.name ?? null : null);
  return rows.map(({ trip, crewName, clientId }) => ({
    date: businessTodayISO(trip.startedAt),
    team: crewName ?? 'Removed team',
    driver: nameOf(trip.driverUserId),
    client: nameOf(clientId),
    route: trip.routeSummary,
    plannedMiles: trip.plannedDistanceMeters != null ? Math.round((trip.plannedDistanceMeters / 1609.344) * 10) / 10 : null,
    plannedMinutes: trip.plannedDurationSeconds != null ? Math.round(trip.plannedDurationSeconds / 60) : null,
    actualMinutes: trip.actualDurationSeconds != null ? Math.round(trip.actualDurationSeconds / 60) : null,
    tollCents: trip.tollState === 'PRICED' ? trip.tollCents : null,
    tollState: trip.tollState,
    avoidedTolls: trip.avoidedTolls,
    provider: trip.provider,
  }));
}
