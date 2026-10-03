import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { tenants, crews } from '@/db/schema';
import { geocodeAddress, drivingMatrix, haversineMiles, type LngLat } from '@/lib/geocoding';

const METERS_PER_MILE = 1609.34;

export type ServiceAreaCheck = { outsideServiceArea: boolean; distanceMiles: number | null };

/**
 * Real road distance, not a crude straight-line radius — researched
 * because a plain mile circle is well known to misjudge both ways (5
 * miles can be a 30-minute drive in traffic, or a 5-minute drive on a
 * highway). Straight-line distance is still used as a one free,
 * API-call-free pre-filter: driving distance is never shorter than
 * straight-line, so if straight-line already exceeds the radius, it's
 * definitely outside and Mapbox's Directions Matrix is never called for
 * that case. Only a borderline/likely-within address spends a real call
 * confirming the actual driving distance from the nearest crew's home
 * base — admin-configurable (Admin → Settings) via
 * tenants.serviceAreaRadiusMiles.
 *
 * distanceMiles is null exactly when the check couldn't be run at all
 * (no crew home base configured yet, or geocoding failed/unavailable);
 * outsideServiceArea is always false in that case too — an unset or
 * failed check never blocks a lead.
 */
export async function checkServiceArea(tenantId: string, addressQuery: string): Promise<ServiceAreaCheck> {
  const tenant = (await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1))[0];
  const radiusMiles = tenant?.serviceAreaRadiusMiles ?? 25;

  const crewRows = await db.select().from(crews).where(eq(crews.tenantId, tenantId));
  const homeCrews = crewRows.filter((c) => c.homeAddressLine1 && c.homeCity && c.homeState);
  if (homeCrews.length === 0) return { outsideServiceArea: false, distanceMiles: null };

  const point = await geocodeAddress(addressQuery);
  if (!point) return { outsideServiceArea: false, distanceMiles: null };

  let nearestStraightLineMiles = Infinity;
  let nearestHome: LngLat | null = null;
  for (const crew of homeCrews) {
    const homeQuery = `${crew.homeAddressLine1}, ${crew.homeCity}, ${crew.homeState} ${crew.homeZip ?? ''}`;
    const homePoint = await geocodeAddress(homeQuery);
    if (!homePoint) continue;
    const d = haversineMiles(point, homePoint);
    if (d < nearestStraightLineMiles) {
      nearestStraightLineMiles = d;
      nearestHome = homePoint;
    }
  }
  if (!nearestHome) return { outsideServiceArea: false, distanceMiles: null };

  if (nearestStraightLineMiles > radiusMiles) {
    // Driving distance is never shorter — no need to spend a Directions
    // call confirming what's already certain.
    return { outsideServiceArea: true, distanceMiles: round1(nearestStraightLineMiles) };
  }

  const matrix = await drivingMatrix([nearestHome, point]);
  if (!matrix) {
    // Mapbox unavailable — the straight-line verdict is the best we have, and it already passed.
    return { outsideServiceArea: false, distanceMiles: round1(nearestStraightLineMiles) };
  }
  const drivingMiles = matrix.distances[0][1] / METERS_PER_MILE;
  return { outsideServiceArea: drivingMiles > radiusMiles, distanceMiles: round1(drivingMiles) };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
