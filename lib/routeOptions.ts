/**
 * Pure helpers for the crew's route choices and their tolls — no DOM, no
 * fetch, no Node imports, so the crew map (components/crew/CrewDirectionsMap.tsx)
 * can share the types and the server (lib/directions.ts) can share the
 * parsing. Two providers feed it:
 *
 * - Google Routes API (computeRoutes with extraComputations TOLLS): real
 *   toll prices, for the toll pass the company uses.
 * - Mapbox Directions (the fallback when there's no Google key): can avoid
 *   tolls and tells us a route crosses a toll road (intersection class
 *   "toll"), but never what it costs.
 */
import type { Coord, NavStep } from '@/lib/turnByTurn';

export type RouteProvider = 'google' | 'mapbox';
export type RouteLabel = 'fastest' | 'alternate' | 'shorter' | 'fuel' | 'noTolls';

/** What a route's tolls are known to be. */
export type TollInfo =
  | { kind: 'none' }
  | { kind: 'priced'; cents: number; currency: string }
  // On a toll road, price unknown (Mapbox, or Google without a price for that road).
  | { kind: 'unpriced' };

export type RouteOption = {
  id: string;
  provider: RouteProvider;
  label: RouteLabel;
  /** "I-10 W and Sam Houston Tollway" — the provider's own name for the way. */
  summary: string;
  distanceMeters: number;
  durationSeconds: number;
  geometry: Coord[];
  steps: NavStep[];
  toll: TollInfo;
};

/** Google's Money (units as an int64 string + nanos) → whole cents. */
export function moneyToCents(money: { units?: string | number | null; nanos?: number | null } | null | undefined): number | null {
  if (!money) return null;
  const units = Number(money.units ?? 0);
  const nanos = Number(money.nanos ?? 0);
  if (!Number.isFinite(units) || !Number.isFinite(nanos)) return null;
  // nanos carries the sign of units (-1.75 is units -1, nanos -750000000).
  return Math.round(units * 100 + nanos / 10_000_000);
}

/** Google's "1234s" duration strings → seconds. */
export function parseDurationSeconds(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v);
  if (typeof v !== 'string') return null;
  const m = /^(-?\d+(?:\.\d+)?)s$/.exec(v.trim());
  return m ? Math.round(Number(m[1])) : null;
}

/** Google's encoded polyline (precision 5) → [lng, lat] pairs, the order Mapbox draws. */
export function decodePolyline(encoded: string, precision = 5): Coord[] {
  const factor = 10 ** precision;
  const out: Coord[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    for (const which of [0, 1] as const) {
      let result = 0;
      let shift = 0;
      let byte: number;
      do {
        if (index >= encoded.length) return out; // truncated input: keep what decoded cleanly
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (which === 0) lat += delta;
      else lng += delta;
    }
    out.push([lng / factor, lat / factor]);
  }
  return out;
}

/** Google's tollInfo → TollInfo. No tollInfo at all means Google expects no tolls. */
export function googleToll(tollInfo: any): TollInfo {
  if (!tollInfo) return { kind: 'none' };
  const prices: any[] = Array.isArray(tollInfo.estimatedPrice) ? tollInfo.estimatedPrice : [];
  // One entry per currency; the crew is in the US, so prefer dollars.
  const price = prices.find((p) => p?.currencyCode === 'USD') ?? prices[0];
  const cents = moneyToCents(price);
  if (price && cents != null && cents >= 0) return { kind: 'priced', cents, currency: price.currencyCode || 'USD' };
  return { kind: 'unpriced' };
}

const GOOGLE_LABELS: Record<string, RouteLabel> = {
  DEFAULT_ROUTE: 'fastest',
  DEFAULT_ROUTE_ALTERNATE: 'alternate',
  SHORTER_DISTANCE: 'shorter',
  FUEL_EFFICIENT: 'fuel',
};

/** Google maneuver names → the Mapbox-style type/modifier the nav arrow understands (lib/turnByTurn.ts). */
function googleManeuver(m: string | undefined): { type: string; modifier: string | null } {
  switch (m) {
    case 'TURN_LEFT':
    case 'ROUNDABOUT_LEFT':
      return { type: 'turn', modifier: 'left' };
    case 'TURN_RIGHT':
    case 'ROUNDABOUT_RIGHT':
      return { type: 'turn', modifier: 'right' };
    case 'TURN_SLIGHT_LEFT':
    case 'RAMP_LEFT':
    case 'FORK_LEFT':
      return { type: 'turn', modifier: 'slight left' };
    case 'TURN_SLIGHT_RIGHT':
    case 'RAMP_RIGHT':
    case 'FORK_RIGHT':
      return { type: 'turn', modifier: 'slight right' };
    case 'TURN_SHARP_LEFT':
      return { type: 'turn', modifier: 'sharp left' };
    case 'TURN_SHARP_RIGHT':
      return { type: 'turn', modifier: 'sharp right' };
    case 'UTURN_LEFT':
    case 'UTURN_RIGHT':
      return { type: 'turn', modifier: 'uturn' };
    case 'DEPART':
      return { type: 'depart', modifier: null };
    case 'MERGE':
      return { type: 'merge', modifier: null };
    default:
      return { type: 'continue', modifier: 'straight' };
  }
}

/**
 * Google's legs[].steps → NavStep[]. Like Mapbox, each step's instruction
 * describes the maneuver at its start, so the step's location is its
 * startLocation. Google has no "arrive" step; one is added at the
 * destination so arrival is announced the same way for both providers.
 */
export function googleSteps(legs: any[], destination: Coord | null, arriveText: string): NavStep[] {
  const out: NavStep[] = [];
  for (const leg of legs ?? []) {
    for (const s of leg?.steps ?? []) {
      const text: string | undefined = s?.navigationInstruction?.instructions;
      const ll = s?.startLocation?.latLng;
      if (!text || typeof ll?.latitude !== 'number' || typeof ll?.longitude !== 'number') continue;
      const { type, modifier } = googleManeuver(s.navigationInstruction.maneuver);
      // Google packs a second line ("Destination will be on the right") after a newline.
      out.push({ instruction: text.replace(/\s*\n\s*/g, '. '), type, modifier, location: [ll.longitude, ll.latitude], distanceMeters: s.distanceMeters ?? 0, name: '' });
    }
  }
  if (destination) out.push({ instruction: arriveText, type: 'arrive', modifier: null, location: destination, distanceMeters: 0, name: '' });
  return out;
}

/** A computeRoutes response → RouteOption[] (routes it can't draw are dropped). */
export function parseGoogleRoutes(data: any, opts: { destination: Coord | null; arriveText: string; idPrefix?: string }): RouteOption[] {
  const routes: any[] = Array.isArray(data?.routes) ? data.routes : [];
  const out: RouteOption[] = [];
  routes.forEach((r, i) => {
    const encoded: string | undefined = r?.polyline?.encodedPolyline;
    const durationSeconds = parseDurationSeconds(r?.duration);
    if (!encoded || durationSeconds == null) return;
    const geometry = decodePolyline(encoded);
    if (geometry.length < 2) return;
    const labels: string[] = Array.isArray(r.routeLabels) ? r.routeLabels : [];
    const label = labels.map((l) => GOOGLE_LABELS[l]).find((l) => l && l !== 'alternate') ?? (i === 0 ? 'fastest' : 'alternate');
    out.push({
      id: `${opts.idPrefix ?? 'g'}${i}`,
      provider: 'google',
      label,
      summary: typeof r.description === 'string' ? r.description : '',
      distanceMeters: Math.round(r.distanceMeters ?? 0),
      durationSeconds,
      geometry,
      steps: googleSteps(r.legs ?? [], opts.destination, opts.arriveText),
      toll: googleToll(r.travelAdvisory?.tollInfo),
    });
  });
  return out;
}

/** Whether a Mapbox route crosses a toll road — its intersections carry the class "toll". */
export function mapboxRouteUsesTolls(route: any): boolean {
  for (const leg of route?.legs ?? []) {
    for (const step of leg?.steps ?? []) {
      for (const x of step?.intersections ?? []) {
        if (Array.isArray(x?.classes) && x.classes.includes('toll')) return true;
      }
    }
  }
  return false;
}

/** A Mapbox Directions response (steps=true, geometries=geojson) → RouteOption[]. */
export function parseMapboxRoutes(data: any, parseSteps: (steps: any[]) => NavStep[], idPrefix = 'm'): RouteOption[] {
  const routes: any[] = Array.isArray(data?.routes) ? data.routes : [];
  const out: RouteOption[] = [];
  routes.forEach((r, i) => {
    const geometry: Coord[] | undefined = r?.geometry?.coordinates;
    if (!Array.isArray(geometry) || geometry.length < 2 || typeof r.duration !== 'number') return;
    out.push({
      id: `${idPrefix}${i}`,
      provider: 'mapbox',
      label: i === 0 ? 'fastest' : 'alternate',
      summary: (r.legs ?? []).map((l: any) => l?.summary).filter(Boolean).join(', '),
      distanceMeters: Math.round(r.distance ?? 0),
      durationSeconds: Math.round(r.duration),
      geometry,
      steps: parseSteps((r.legs ?? []).flatMap((l: any) => l?.steps ?? [])),
      toll: mapboxRouteUsesTolls(r) ? { kind: 'unpriced' } : { kind: 'none' },
    });
  });
  return out;
}

export const hasTolls = (o: Pick<RouteOption, 'toll'>) => o.toll.kind !== 'none';

/**
 * Adds the toll-free route to a list that only offers toll routes, so the
 * crew sees the trade-off ("Fastest · $3.40" vs "No tolls · +7 min")
 * without flipping the switch. Skipped if it's the same route already listed.
 */
export function withNoTollOption(options: RouteOption[], noToll: RouteOption[]): RouteOption[] {
  if (!options.some(hasTolls) || options.some((o) => !hasTolls(o))) return options;
  const pick = noToll.find((o) => !hasTolls(o));
  if (!pick) return options;
  const dup = options.some((o) => Math.abs(o.distanceMeters - pick.distanceMeters) < 50 && Math.abs(o.durationSeconds - pick.durationSeconds) < 30);
  return dup ? options : [...options, { ...pick, label: 'noTolls' }];
}

/** With "Avoid tolls" on, toll-free routes come first (the provider only avoids tolls "where reasonable"). */
export function orderForAvoidTolls(options: RouteOption[]): RouteOption[] {
  return [...options.filter((o) => !hasTolls(o)), ...options.filter(hasTolls)];
}

export const metersToMiles = (m: number) => Math.round((m / 1609.344) * 10) / 10;
export const secondsToMinutes = (s: number) => Math.max(1, Math.round(s / 60));

const LABEL_EN: Record<RouteLabel, string> = { fastest: 'Fastest', alternate: 'Alternate', shorter: 'Shortest', fuel: 'Fuel-saving', noTolls: 'No tolls' };

/**
 * The one-line record of a route, kept on the trip and in the toll
 * expense's note (English: the admin side isn't translated).
 * "Fastest via I-10 W · 18.2 mi · 24 min".
 */
export function routeSummaryLine(r: { label: RouteLabel | string; summary: string; distanceMeters: number; durationSeconds: number }): string {
  const name = LABEL_EN[r.label as RouteLabel] ?? 'Route';
  const via = r.summary ? ` via ${r.summary}` : '';
  return `${name}${via} · ${metersToMiles(r.distanceMeters)} mi · ${secondsToMinutes(r.durationSeconds)} min`;
}
