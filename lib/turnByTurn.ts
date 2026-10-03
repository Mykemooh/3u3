/**
 * Pure helpers for in-app turn-by-turn (components/crew/CrewDirectionsMap.tsx)
 * — no DOM, no fetch, safe in a client bundle. Mapbox's Directions API
 * (with steps=true) returns each maneuver's instruction and the point it
 * happens at; everything here is about turning that + a stream of GPS
 * fixes into "which step is current, how far to it, when to announce it,
 * and has the driver wandered off the route."
 */

export type Coord = [number, number]; // [lng, lat]

export type NavStep = {
  instruction: string;
  type: string;
  modifier: string | null;
  location: Coord;
  distanceMeters: number;
  name: string;
};

/** Mapbox's raw route.legs[0].steps -> the flat shape the nav UI actually needs. */
export function parseSteps(mapboxSteps: any[]): NavStep[] {
  return (mapboxSteps ?? []).map((s) => ({
    instruction: s.maneuver?.instruction ?? 'Continue',
    type: s.maneuver?.type ?? 'continue',
    modifier: s.maneuver?.modifier ?? null,
    location: s.maneuver?.location ?? [0, 0],
    distanceMeters: s.distance ?? 0,
    name: s.name ?? '',
  }));
}

const EARTH_RADIUS_M = 6_371_000;

export function distanceMeters(a: Coord, b: Coord): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * sinLng * sinLng;
  return EARTH_RADIUS_M * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Compass bearing (0-360, 0 = north) from a to b — used to rotate the map/arrow when the device gives no heading of its own. */
export function bearingBetween(a: Coord, b: Coord): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const y = Math.sin(toRad(b[0] - a[0])) * Math.cos(toRad(b[1]));
  const x = Math.cos(toRad(a[1])) * Math.sin(toRad(b[1])) - Math.sin(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.cos(toRad(b[0] - a[0]));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** How far off the route's own line the driver currently is, in meters — the reroute trigger. */
export function distanceToRoute(point: Coord, route: Coord[]): number {
  if (route.length === 0) return Infinity;
  let best = Infinity;
  for (let i = 0; i < route.length - 1; i += 1) {
    const d = distanceToSegment(point, route[i], route[i + 1]);
    if (d < best) best = d;
  }
  return best;
}

function distanceToSegment(p: Coord, a: Coord, b: Coord): number {
  // Flat-plane projection is fine at the scale of one route segment.
  const ax = a[0], ay = a[1], bx = b[0], by = b[1], px = p[0], py = p[1];
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  const closest: Coord = [ax + t * dx, ay + t * dy];
  return distanceMeters(p, closest);
}

/** Rotation (degrees) for a simple arrow glyph representing this maneuver. */
export function maneuverArrowRotation(step: NavStep): number {
  if (step.type === 'arrive') return 0;
  switch (step.modifier) {
    case 'left':
      return -90;
    case 'right':
      return 90;
    case 'slight left':
      return -45;
    case 'slight right':
      return 45;
    case 'sharp left':
      return -135;
    case 'sharp right':
      return 135;
    case 'uturn':
      return 180;
    default:
      return 0;
  }
}

export function formatDistance(meters: number): string {
  const feet = meters * 3.28084;
  if (feet < 500) return `${Math.round(feet / 10) * 10} ft`;
  const miles = meters / 1609.34;
  return `${miles < 1 ? miles.toFixed(1) : Math.round(miles)} mi`;
}

/** The spoken-announcement distance "buckets" for one step, crossed in order as the driver approaches it — each fires once. */
export const ANNOUNCE_THRESHOLDS_METERS = [800, 150, 30];
