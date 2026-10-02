/**
 * Ephemeral geocoding — turns an address string into a point, in memory,
 * never persisted. Mapbox's free geocoding tier only allows temporary
 * use (the same constraint lib/tracking.ts's destinationFor() already
 * respects by wiping jobs.destLat/destLng after each trip), so
 * lib/routeOptimization.ts and the booking crew-assignment tiebreak both
 * geocode fresh every time rather than caching coordinates anywhere.
 */

const PUBLIC_TOKEN = () => process.env.MAPBOX_ACCESS_TOKEN || '';
const SERVER_TOKEN = () => process.env.MAPBOX_SERVER_TOKEN || PUBLIC_TOKEN();

export type LngLat = { lat: number; lng: number };

export function isValidLngLat(v: unknown): v is LngLat {
  const p = v as LngLat;
  return !!p && typeof p.lat === 'number' && typeof p.lng === 'number' && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;
}

export function geocodingConfigured(): boolean {
  return !!SERVER_TOKEN();
}

/** One address string -> one point, or null if it can't be matched exactly. */
export async function geocodeAddress(query: string): Promise<LngLat | null> {
  const token = SERVER_TOKEN();
  if (!token || !query.trim()) return null;
  try {
    const res = await fetch(
      `https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(query)}&country=us&limit=1&types=address&access_token=${token}`,
    );
    if (!res.ok) {
      console.error('[geocoding] request failed:', res.status, await res.text());
      return null;
    }
    const data = await res.json();
    const [lng, lat] = data?.features?.[0]?.geometry?.coordinates ?? [];
    if (!isValidLngLat({ lat, lng })) return null;
    return { lat, lng };
  } catch (err) {
    console.error('[geocoding] request failed:', err);
    return null;
  }
}

/** Straight-line distance in miles — a fast, free proxy for "roughly how far," no API call. */
export function haversineMiles(a: LngLat, b: LngLat): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return R * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Real driving distance/duration between every pair of points, via
 * Mapbox's Directions Matrix API — what lib/routeOptimization.ts builds
 * its route order from. Mapbox caps a single matrix at 25 points
 * (sources x destinations combined); callers are expected to stay under
 * that (a crew's jobs in one day).
 */
export async function drivingMatrix(points: LngLat[]): Promise<{ distances: number[][]; durations: number[][] } | null> {
  const token = SERVER_TOKEN();
  if (!token || points.length < 2) return null;
  if (points.length > 25) throw new Error('drivingMatrix: Mapbox allows at most 25 points per request');
  const coords = points.map((p) => `${p.lng},${p.lat}`).join(';');
  try {
    const res = await fetch(
      `https://api.mapbox.com/directions-matrix/v1/mapbox/driving/${coords}?annotations=distance,duration&access_token=${token}`,
    );
    if (!res.ok) {
      console.error('[geocoding] matrix request failed:', res.status, await res.text());
      return null;
    }
    const data = await res.json();
    if (!Array.isArray(data?.distances) || !Array.isArray(data?.durations)) return null;
    return { distances: data.distances, durations: data.durations };
  } catch (err) {
    console.error('[geocoding] matrix request failed:', err);
    return null;
  }
}
