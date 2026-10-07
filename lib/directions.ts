import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';
import { parseSteps } from '@/lib/turnByTurn';
import {
  parseGoogleRoutes, parseMapboxRoutes, withNoTollOption, orderForAvoidTolls,
  type RouteOption, type RouteProvider, type RouteLabel, type TollInfo,
} from '@/lib/routeOptions';
import type { LngLat } from '@/lib/geocoding';

/**
 * Server side of the crew's in-app directions: the route choices to a job
 * and what each costs in tolls.
 *
 * Google's Routes API is the one that knows toll prices, so with
 * GOOGLE_MAPS_API_KEY set (the same key Places uses — enable "Routes API"
 * on it) routes come from there. Without it, or whenever Google fails,
 * Mapbox Directions takes over: it can still avoid tolls and say a route
 * uses them, just not the price. Directions never fail because of tolls.
 *
 * Every Mapbox call here uses the server token (see lib/tracking.ts for
 * why a URL-restricted public token can't be used from the server).
 */

/**
 * The toll pass priced against. Houston-area crews almost all carry an
 * EZ TAG (it's also accepted on TxTag and NTTA TollTag roads), and pass
 * rates are well below the pay-by-mail rate Google would otherwise quote.
 * A constant rather than a company setting for now; GOOGLE_TOLL_PASSES
 * (comma-separated Google TollPass names, e.g. "US_TX_TXTAG") overrides it,
 * and "NONE" prices at the cash / pay-by-mail rate.
 */
const DEFAULT_TOLL_PASSES = ['US_TX_EZTAG'];

const PASS_NAMES: Record<string, string> = {
  US_TX_EZTAG: 'EZ TAG',
  US_TX_TXTAG: 'TxTag',
  US_TX_TOLLTAG: 'TollTag',
  US_TX_PLUSPASS: 'PlusPass',
  US_TX_EPTOLL: 'EP Toll',
};

export function tollPasses(): string[] {
  const raw = process.env.GOOGLE_TOLL_PASSES?.trim();
  if (!raw) return DEFAULT_TOLL_PASSES;
  if (raw.toUpperCase() === 'NONE') return [];
  return raw.split(',').map((s) => s.trim()).filter((s) => /^[A-Z0-9_]{3,60}$/.test(s));
}

/** "EZ TAG" — what the crew sees next to a price, and the toll expense's vendor. Null when priced at the cash rate. */
export function tollPassLabel(): string | null {
  const passes = tollPasses();
  if (!passes.length) return null;
  return passes.map((p) => PASS_NAMES[p] ?? p.replace(/^[A-Z]{2}_[A-Z]{2}_/, '').replace(/_/g, ' ')).join(' / ');
}

export const routesConfigured = () => !!process.env.GOOGLE_MAPS_API_KEY?.trim();
const mapboxServerToken = () => process.env.MAPBOX_SERVER_TOKEN || process.env.MAPBOX_ACCESS_TOKEN || '';

const GOOGLE_FIELD_MASK = [
  'routes.routeLabels',
  'routes.description',
  'routes.distanceMeters',
  'routes.duration',
  'routes.polyline.encodedPolyline',
  'routes.travelAdvisory.tollInfo',
  'routes.legs.steps.navigationInstruction',
  'routes.legs.steps.startLocation',
  'routes.legs.steps.distanceMeters',
].join(',');

type Query = { from: LngLat; to: LngLat; avoidTolls: boolean; lang: 'en' | 'es'; arriveText: string; alternatives: boolean };

async function googleRoutes(q: Query, avoidTolls: boolean, idPrefix: string): Promise<RouteOption[] | null> {
  const key = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!key) return null;
  const passes = tollPasses();
  try {
    const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': GOOGLE_FIELD_MASK },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: q.from.lat, longitude: q.from.lng } } },
        destination: { location: { latLng: { latitude: q.to.lat, longitude: q.to.lng } } },
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_AWARE',
        computeAlternativeRoutes: q.alternatives,
        extraComputations: ['TOLLS'],
        routeModifiers: { avoidTolls, ...(passes.length ? { tollPasses: passes } : {}) },
        languageCode: q.lang === 'es' ? 'es' : 'en-US',
        units: 'IMPERIAL',
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error('[directions] Google Routes failed:', res.status, (await res.text()).slice(0, 500));
      return null;
    }
    const options = parseGoogleRoutes(await res.json(), { destination: [q.to.lng, q.to.lat], arriveText: q.arriveText, idPrefix });
    return options.length ? options : null;
  } catch (err) {
    console.error('[directions] Google Routes failed:', err);
    return null;
  }
}

async function mapboxRoutes(q: Query, avoidTolls: boolean, idPrefix: string): Promise<RouteOption[] | null> {
  const token = mapboxServerToken();
  if (!token) return null;
  const params = new URLSearchParams({
    geometries: 'geojson',
    overview: 'full',
    steps: 'true',
    language: q.lang,
    alternatives: q.alternatives ? 'true' : 'false',
    access_token: token,
  });
  if (avoidTolls) params.set('exclude', 'toll');
  try {
    const res = await fetch(
      `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${q.from.lng},${q.from.lat};${q.to.lng},${q.to.lat}?${params}`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) {
      console.error('[directions] Mapbox failed:', res.status, (await res.text()).slice(0, 500));
      return null;
    }
    const options = parseMapboxRoutes(await res.json(), parseSteps, idPrefix);
    return options.length ? options : null;
  } catch (err) {
    console.error('[directions] Mapbox failed:', err);
    return null;
  }
}

/**
 * The route choices from `from` to `to`, best first. With tolls allowed
 * and only toll routes offered, the best toll-free route is fetched too and
 * listed as "No tolls", so the crew sees both prices side by side.
 * Null when no provider could route at all.
 */
export async function fetchRouteOptions(q: Query): Promise<{ provider: RouteProvider; options: RouteOption[] } | null> {
  for (const [provider, fetcher] of [['google', googleRoutes], ['mapbox', mapboxRoutes]] as const) {
    const options = await fetcher(q, q.avoidTolls, provider[0]);
    if (!options) continue;
    if (q.avoidTolls) return { provider, options: orderForAvoidTolls(options) };
    if (q.alternatives && options.some((o) => o.toll.kind !== 'none') && !options.some((o) => o.toll.kind === 'none')) {
      const noToll = await fetcher({ ...q, alternatives: false }, true, `${provider[0]}n`);
      return { provider, options: withNoTollOption(options, noToll ?? []) };
    }
    return { provider, options };
  }
  return null;
}

// ---------------------------------------------------------------------------
// The route the crew picked, signed. The trip record and its toll expense
// are built from what the server computed, not from numbers the phone
// sends back — so a toll amount can't be typed in from the crew app.
// ---------------------------------------------------------------------------

export type RouteChoice = {
  jobId: string;
  provider: RouteProvider;
  label: RouteLabel;
  summary: string;
  distanceMeters: number;
  durationSeconds: number;
  toll: TollInfo;
  tollPass: string | null;
  /** The "Avoid tolls" switch was on. */
  avoidTolls: boolean;
  /** At least one of the routes offered had tolls — so a toll-free pick was a real choice. */
  tollsOffered: boolean;
  issuedAt: number;
};

const CHOICE_TTL_MS = 12 * 3600_000;

function choiceKey() {
  const base = process.env.NEXTAUTH_SECRET || 'dev-secret';
  return Buffer.from(hkdfSync('sha256', base, 'trashcan-route-choice', 'crew-trip', 32));
}

export function signRouteChoice(choice: RouteChoice): string {
  const body = Buffer.from(JSON.stringify(choice)).toString('base64url');
  const mac = createHmac('sha256', choiceKey()).update(body).digest('base64url');
  return `${body}.${mac}`;
}

/** The signed choice back, or null if it was tampered with, is for another job, or is stale. */
export function verifyRouteChoice(token: unknown, jobId: string, now = Date.now()): RouteChoice | null {
  if (typeof token !== 'string' || token.length > 4000) return null;
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;
  const want = Buffer.from(createHmac('sha256', choiceKey()).update(body).digest('base64url'));
  const got = Buffer.from(mac);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const choice = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as RouteChoice;
    if (choice.jobId !== jobId) return null;
    if (typeof choice.issuedAt !== 'number' || now - choice.issuedAt > CHOICE_TTL_MS || choice.issuedAt - now > 60_000) return null;
    return choice;
  } catch {
    return null;
  }
}

/** Options as the crew app receives them: each carries its signed choice. */
export function withChoiceTokens(
  jobId: string,
  options: RouteOption[],
  ctx: { avoidTolls: boolean; now?: number },
): (RouteOption & { choiceToken: string })[] {
  const tollsOffered = options.some((o) => o.toll.kind !== 'none');
  const tollPass = tollPassLabel();
  const issuedAt = ctx.now ?? Date.now();
  return options.map((o) => ({
    ...o,
    choiceToken: signRouteChoice({
      jobId,
      provider: o.provider,
      label: o.label,
      summary: o.summary.slice(0, 200),
      distanceMeters: o.distanceMeters,
      durationSeconds: o.durationSeconds,
      toll: o.toll,
      tollPass: o.provider === 'google' && o.toll.kind === 'priced' ? tollPass : null,
      avoidTolls: ctx.avoidTolls,
      tollsOffered,
      issuedAt,
    }),
  }));
}

