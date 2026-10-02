import { eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { crews, bookings, addresses, serviceTypes } from '@/db/schema';
import { geocodeAddress, drivingMatrix, haversineMiles, type LngLat } from '@/lib/geocoding';

export class RouteOptimizationError extends Error {}

/**
 * Route optimization for a crew's day — real operations-research, not an
 * LLM asked to eyeball a map. An LLM is a poor fit for this: it can't
 * reliably do exact distance arithmetic or guarantee a valid route over
 * many stops, and it would be slower and less predictable than the
 * purpose-built approach every real routing product (vehicle routing in
 * logistics, Jobber/Housecall Pro's own route optimization) actually
 * uses — nearest-neighbor construction improved by 2-opt, over a real
 * driving-distance matrix. That's what's implemented here, against
 * Mapbox's Directions Matrix API (the same Mapbox account already used
 * for live tracking, lib/tracking.ts).
 *
 * Addresses are geocoded fresh for this one calculation and never
 * persisted — this app's standing policy (see db/schema.ts crews and
 * jobs.destLat/destLng) since Mapbox's free geocoding tier only allows
 * temporary use.
 */

export type RouteStop = {
  bookingId: string;
  label: string; // client name or address line
  slotStart: string;
  slotEnd: string;
};

export type OptimizedRoute = {
  stops: (RouteStop & { order: number })[];
  totalMiles: number;
  totalMinutes: number;
  currentTotalMiles: number;
  currentTotalMinutes: number;
  savingsMiles: number;
  savingsMinutes: number;
  unroutedCount: number; // stops whose address couldn't be geocoded — left out, never silently dropped without saying so
};

type Job = { bookingId: string; label: string; slotStart: string; slotEnd: string; point: LngLat };

/** 2-opt: repeatedly reverse a segment if it shortens the tour, until no single swap helps. Standard, deterministic, bounded. */
function twoOpt(order: number[], dist: (a: number, b: number) => number): number[] {
  let improved = true;
  let route = order;
  let guard = 0;
  while (improved && guard < 200) {
    improved = false;
    guard += 1;
    for (let i = 0; i < route.length - 1; i += 1) {
      for (let j = i + 1; j < route.length; j += 1) {
        const a = route[i === 0 ? 0 : i - 1] ?? route[0];
        const b = route[i];
        const c = route[j];
        const d = route[j + 1] ?? c;
        if (i === 0 || j === route.length - 1) continue; // keep the home-base start/implicit end fixed
        const before = dist(a, b) + dist(c, d);
        const after = dist(a, c) + dist(b, d);
        if (after + 1e-6 < before) {
          route = [...route.slice(0, i), ...route.slice(i, j + 1).reverse(), ...route.slice(j + 1)];
          improved = true;
        }
      }
    }
  }
  return route;
}

function orderTour(points: LngLat[], distances: number[][]): number[] {
  const n = points.length;
  const visited = new Array(n).fill(false);
  visited[0] = true;
  const tour = [0];
  for (let step = 1; step < n; step += 1) {
    const last = tour[tour.length - 1];
    let best = -1;
    let bestDist = Infinity;
    for (let k = 0; k < n; k += 1) {
      if (visited[k]) continue;
      if (distances[last][k] < bestDist) {
        bestDist = distances[last][k];
        best = k;
      }
    }
    visited[best] = true;
    tour.push(best);
  }
  return twoOpt(tour, (a, b) => distances[a][b]);
}

function tourLengthAndDuration(tour: number[], distances: number[][], durations: number[][]) {
  let miles = 0;
  let minutes = 0;
  for (let i = 0; i < tour.length - 1; i += 1) {
    miles += distances[tour[i]][tour[i + 1]] / 1609.34; // meters -> miles
    minutes += durations[tour[i]][tour[i + 1]] / 60; // seconds -> minutes
  }
  return { miles, minutes };
}

/**
 * Optimizes one crew's one day. Returns null if there's nothing to
 * optimize (fewer than 2 jobs) or if geocoding/Mapbox isn't available —
 * callers should fall back to showing the schedule as booked, unordered.
 */
export async function optimizeRouteForCrew(tenantId: string, crewId: string, dateISO: string): Promise<OptimizedRoute | null> {
  const crew = (await db.select().from(crews).where(eq(crews.id, crewId)).limit(1))[0];
  if (!crew || crew.tenantId !== tenantId) throw new RouteOptimizationError('Team not found');
  if (!crew.homeAddressLine1 || !crew.homeCity || !crew.homeState) {
    throw new RouteOptimizationError("This team doesn't have a home base set yet — add one on the Team page.");
  }

  const dayBookings = (await db.select().from(bookings).where(eq(bookings.crewId, crewId)))
    .filter((b) => b.status !== 'CANCELLED' && !b.isQuoteVisit && b.slotStart.startsWith(dateISO))
    .sort((a, b) => a.slotStart.localeCompare(b.slotStart));
  if (dayBookings.length < 2) return null;

  const addressIds = dayBookings.map((b) => b.addressId).filter(Boolean) as string[];
  const addressRows = addressIds.length ? await db.select().from(addresses).where(inArray(addresses.id, addressIds)) : [];
  const serviceIds = [...new Set(dayBookings.map((b) => b.serviceTypeId).filter(Boolean) as string[])];
  const serviceRows = serviceIds.length ? await db.select().from(serviceTypes).where(inArray(serviceTypes.id, serviceIds)) : [];

  const homeQuery = `${crew.homeAddressLine1}, ${crew.homeCity}, ${crew.homeState}${crew.homeZip ? ` ${crew.homeZip}` : ''}`;
  const homePoint = await geocodeAddress(homeQuery);
  if (!homePoint) throw new RouteOptimizationError("Couldn't locate this team's home base — check the address on the Team page.");

  const jobs: Job[] = [];
  let unroutedCount = 0;
  for (const booking of dayBookings) {
    const address = addressRows.find((a) => a.id === booking.addressId);
    const service = serviceRows.find((s) => s.id === booking.serviceTypeId);
    const query = address ? `${address.line1}, ${address.city}, ${address.state}${address.zip ? ` ${address.zip}` : ''}` : null;
    const point = query ? await geocodeAddress(query) : null;
    if (!point) {
      unroutedCount += 1;
      continue;
    }
    jobs.push({
      bookingId: booking.id,
      label: address ? `${address.line1}, ${address.city}` : service?.name ?? 'Cleaning',
      slotStart: booking.slotStart,
      slotEnd: booking.slotEnd,
      point,
    });
  }
  if (jobs.length < 2) return null;

  const points = [homePoint, ...jobs.map((j) => j.point)];
  const matrix = await drivingMatrix(points);
  if (!matrix) throw new RouteOptimizationError('Could not reach the mapping service — please try again shortly.');

  // An open path (home -> every job once), not a closed loop back to
  // home — the savings that matter here are almost entirely in visit
  // order, and a final drive home is roughly the same distance
  // regardless of which order got the crew to their last stop.
  const tour = orderTour(points, matrix.distances);
  const { miles: totalMiles, minutes: totalMinutes } = tourLengthAndDuration(tour, matrix.distances, matrix.durations);

  // "Current" = whatever order the jobs are already booked in (by time),
  // home-to-first then straight through — the baseline the optimized
  // route is compared against for a savings estimate.
  const currentTour = [0, ...jobs.map((_, i) => i + 1)];
  const { miles: currentTotalMiles, minutes: currentTotalMinutes } = tourLengthAndDuration(currentTour, matrix.distances, matrix.durations);

  const stops = tour
    .filter((i) => i !== 0)
    .map((i, order) => ({ ...jobs[i - 1], order: order + 1 }));

  return {
    stops,
    totalMiles: Math.round(totalMiles * 10) / 10,
    totalMinutes: Math.round(totalMinutes),
    currentTotalMiles: Math.round(currentTotalMiles * 10) / 10,
    currentTotalMinutes: Math.round(currentTotalMinutes),
    savingsMiles: Math.max(0, Math.round((currentTotalMiles - totalMiles) * 10) / 10),
    savingsMinutes: Math.max(0, Math.round(currentTotalMinutes - totalMinutes)),
    unroutedCount,
  };
}

/**
 * Lightweight crew-assignment tiebreak for a new booking: when more than
 * one team is free for the exact requested slot, prefer whichever has
 * the closest home base to the client — a fast straight-line estimate
 * (haversineMiles), not a Matrix call, so it never slows down booking
 * creation. Never persists anything; returns the original order
 * unchanged if geocoding isn't available or only one team is free.
 */
export async function pickNearestTeam<T extends { id: string; homeAddressLine1: string | null; homeCity: string | null; homeState: string | null; homeZip: string | null }>(
  teams: T[],
  clientAddress: { line1: string; city: string; state: string; zip: string | null } | null,
): Promise<T[]> {
  if (teams.length < 2 || !clientAddress) return teams;
  const clientQuery = `${clientAddress.line1}, ${clientAddress.city}, ${clientAddress.state}${clientAddress.zip ? ` ${clientAddress.zip}` : ''}`;
  const clientPoint = await geocodeAddress(clientQuery);
  if (!clientPoint) return teams;

  const withDistance = await Promise.all(
    teams.map(async (team) => {
      if (!team.homeAddressLine1 || !team.homeCity || !team.homeState) return { team, distance: Infinity };
      const homeQuery = `${team.homeAddressLine1}, ${team.homeCity}, ${team.homeState}${team.homeZip ? ` ${team.homeZip}` : ''}`;
      const homePoint = await geocodeAddress(homeQuery);
      if (!homePoint) return { team, distance: Infinity };
      return { team, distance: haversineMiles(homePoint, clientPoint) };
    }),
  );
  if (withDistance.every((w) => w.distance === Infinity)) return teams;
  return withDistance.sort((a, b) => a.distance - b.distance).map((w) => w.team);
}
