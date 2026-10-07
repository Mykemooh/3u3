import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  moneyToCents, parseDurationSeconds, decodePolyline, googleToll, parseGoogleRoutes, parseMapboxRoutes,
  mapboxRouteUsesTolls, withNoTollOption, orderForAvoidTolls, routeSummaryLine, type RouteOption,
} from '@/lib/routeOptions';
import { parseSteps } from '@/lib/turnByTurn';
import { fetchRouteOptions, signRouteChoice, verifyRouteChoice, withChoiceTokens, tollPasses, tollPassLabel, type RouteChoice } from '@/lib/directions';
import { tripFieldsFromChoice, actualDriveSeconds, summarizeTrips, summarizeByTeam, tollExpenseNote, type TripRow } from '@/lib/trips';

// Pure — no database. Run alone with:
//   POSTGRES_URL=postgres://x@localhost:1/x npx tsx --test tests/routeOptions.test.ts

const realFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = realFetch;
  delete process.env.GOOGLE_MAPS_API_KEY;
  delete process.env.GOOGLE_TOLL_PASSES;
  delete process.env.MAPBOX_SERVER_TOKEN;
});

test('Google Money becomes whole cents, including negative and missing parts', () => {
  assert.equal(moneyToCents({ units: '3', nanos: 400_000_000 }), 340);
  assert.equal(moneyToCents({ units: '12', nanos: 0 }), 1200);
  assert.equal(moneyToCents({ nanos: 750_000_000 }), 75);
  assert.equal(moneyToCents({ units: '-1', nanos: -750_000_000 }), -175);
  assert.equal(moneyToCents({ units: '0', nanos: 5_000_000 }), 1, 'half a cent rounds up');
  assert.equal(moneyToCents(null), null);
  assert.equal(moneyToCents({ units: 'abc' }), null);
});

test('durations and polylines decode', () => {
  assert.equal(parseDurationSeconds('1234s'), 1234);
  assert.equal(parseDurationSeconds('59.6s'), 60);
  assert.equal(parseDurationSeconds('soon'), null);
  assert.equal(parseDurationSeconds(42), 42);
  // Google's documented example: (38.5, -120.2), (40.7, -120.95), (43.252, -126.453).
  assert.deepEqual(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@'), [[-120.2, 38.5], [-120.95, 40.7], [-126.453, 43.252]]);
  assert.deepEqual(decodePolyline(''), []);
  assert.deepEqual(decodePolyline('_p~iF~ps|U_ulL'), [[-120.2, 38.5]], 'a truncated tail is dropped, not garbage');
});

test('toll info: none, priced (USD preferred), or on a toll road with no price', () => {
  assert.deepEqual(googleToll(undefined), { kind: 'none' });
  assert.deepEqual(googleToll({ estimatedPrice: [{ currencyCode: 'MXN', units: '50' }, { currencyCode: 'USD', units: '3', nanos: 400_000_000 }] }), { kind: 'priced', cents: 340, currency: 'USD' });
  assert.deepEqual(googleToll({}), { kind: 'unpriced' });
  assert.deepEqual(googleToll({ estimatedPrice: [] }), { kind: 'unpriced' });
});

const googleResponse = {
  routes: [
    {
      routeLabels: ['DEFAULT_ROUTE'],
      description: 'Westpark Tollway',
      distanceMeters: 29290,
      duration: '1440s',
      polyline: { encodedPolyline: '_p~iF~ps|U_ulLnnqC' },
      travelAdvisory: { tollInfo: { estimatedPrice: [{ currencyCode: 'USD', units: '3', nanos: 400_000_000 }] } },
      legs: [
        {
          steps: [
            { distanceMeters: 300, startLocation: { latLng: { latitude: 38.5, longitude: -120.2 } }, navigationInstruction: { maneuver: 'DEPART', instructions: 'Head north on Main St' } },
            { distanceMeters: 0, startLocation: { latLng: { latitude: 39, longitude: -120.5 } } },
            { distanceMeters: 900, startLocation: { latLng: { latitude: 40, longitude: -120.7 } }, navigationInstruction: { maneuver: 'TURN_LEFT', instructions: 'Turn left onto Elm St\nDestination will be on the right' } },
          ],
        },
      ],
    },
    {
      routeLabels: ['DEFAULT_ROUTE_ALTERNATE'],
      description: 'I-10 W',
      distanceMeters: 31000,
      duration: '1860s',
      polyline: { encodedPolyline: '_p~iF~ps|U_ulLnnqC' },
      legs: [],
    },
    { routeLabels: ['DEFAULT_ROUTE_ALTERNATE'], duration: '100s', polyline: {} },
  ],
};

test('Google routes parse into labelled options with turn-by-turn and an arrival step', () => {
  const options = parseGoogleRoutes(googleResponse, { destination: [-120.95, 40.7], arriveText: 'You have arrived.' });
  assert.equal(options.length, 2, 'a route with no line is dropped');
  const [fast, alt] = options;
  assert.equal(fast.label, 'fastest');
  assert.equal(fast.provider, 'google');
  assert.equal(fast.durationSeconds, 1440);
  assert.deepEqual(fast.toll, { kind: 'priced', cents: 340, currency: 'USD' });
  assert.equal(fast.geometry.length, 2);
  assert.equal(fast.steps.length, 3, 'two real instructions (the blank one skipped) + arrive');
  assert.equal(fast.steps[1].instruction, 'Turn left onto Elm St. Destination will be on the right');
  assert.equal(fast.steps[1].modifier, 'left');
  assert.deepEqual(fast.steps[1].location, [-120.7, 40]);
  assert.equal(fast.steps[2].type, 'arrive');
  assert.equal(alt.label, 'alternate');
  assert.deepEqual(alt.toll, { kind: 'none' });
  assert.notEqual(fast.id, alt.id);
});

const mapboxResponse = {
  routes: [
    {
      distance: 29000,
      duration: 1500,
      geometry: { coordinates: [[-95.8, 29.7], [-95.6, 29.75]] },
      legs: [{ summary: 'Westpark Tollway', steps: [{ maneuver: { instruction: 'Drive east', type: 'depart', location: [-95.8, 29.7] }, intersections: [{ classes: ['toll', 'motorway'] }] }, { maneuver: { instruction: 'You have arrived', type: 'arrive', location: [-95.6, 29.75] }, intersections: [{}] }] }],
    },
    {
      distance: 31000,
      duration: 1800,
      geometry: { coordinates: [[-95.8, 29.7], [-95.6, 29.75]] },
      legs: [{ summary: 'I-10', steps: [{ maneuver: { instruction: 'Drive east', type: 'depart', location: [-95.8, 29.7] }, intersections: [{ classes: ['motorway'] }] }] }],
    },
  ],
};

test('Mapbox routes say whether they use toll roads, never a price', () => {
  assert.equal(mapboxRouteUsesTolls(mapboxResponse.routes[0]), true);
  assert.equal(mapboxRouteUsesTolls(mapboxResponse.routes[1]), false);
  assert.equal(mapboxRouteUsesTolls(null), false);
  const options = parseMapboxRoutes(mapboxResponse, parseSteps);
  assert.deepEqual(options.map((o) => [o.label, o.toll.kind, o.summary]), [['fastest', 'unpriced', 'Westpark Tollway'], ['alternate', 'none', 'I-10']]);
  assert.equal(options[0].steps.length, 2);
});

const opt = (id: string, toll: RouteOption['toll'], durationSeconds = 1000, distanceMeters = 20000): RouteOption => ({
  id, provider: 'google', label: 'fastest', summary: '', distanceMeters, durationSeconds, geometry: [[0, 0], [1, 1]], steps: [], toll,
});

test('a toll-only list gains the toll-free route; avoid-tolls lists toll-free first', () => {
  const priced = opt('a', { kind: 'priced', cents: 340, currency: 'USD' });
  const free = opt('n', { kind: 'none' }, 1400, 24000);
  const merged = withNoTollOption([priced], [free]);
  assert.deepEqual(merged.map((o) => [o.id, o.label]), [['a', 'fastest'], ['n', 'noTolls']]);
  assert.equal(withNoTollOption([priced, opt('b', { kind: 'none' })], [free]).length, 2, 'already has a toll-free choice');
  assert.equal(withNoTollOption([priced], [opt('n', { kind: 'none' }, 1010, 20010)]).length, 1, 'the same route is not listed twice');
  assert.equal(withNoTollOption([priced], []).length, 1);
  assert.deepEqual(orderForAvoidTolls([priced, free]).map((o) => o.id), ['n', 'a']);
});

test('the route summary line reads like a person wrote it', () => {
  assert.equal(routeSummaryLine({ label: 'fastest', summary: 'Westpark Tollway', distanceMeters: 29290, durationSeconds: 1440 }), 'Fastest via Westpark Tollway · 18.2 mi · 24 min');
  assert.equal(routeSummaryLine({ label: 'noTolls', summary: '', distanceMeters: 1609.344, durationSeconds: 10 }), 'No tolls · 1 mi · 1 min');
  assert.equal(tollExpenseNote('Fastest · 1 mi · 2 min', 'Ana Ruiz'), 'Drive to Ana Ruiz · Fastest · 1 mi · 2 min · added from the crew app');
});

test('toll pass: EZ TAG by default, overridable, NONE for the cash rate', () => {
  delete process.env.GOOGLE_TOLL_PASSES;
  assert.deepEqual(tollPasses(), ['US_TX_EZTAG']);
  assert.equal(tollPassLabel(), 'EZ TAG');
  process.env.GOOGLE_TOLL_PASSES = 'US_TX_TXTAG, bad pass!';
  assert.deepEqual(tollPasses(), ['US_TX_TXTAG']);
  assert.equal(tollPassLabel(), 'TxTag');
  process.env.GOOGLE_TOLL_PASSES = 'none';
  assert.deepEqual(tollPasses(), []);
  assert.equal(tollPassLabel(), null);
  delete process.env.GOOGLE_TOLL_PASSES;
});

const choice = (over: Partial<RouteChoice> = {}): RouteChoice => ({
  jobId: 'job-1', provider: 'google', label: 'fastest', summary: 'Westpark Tollway', distanceMeters: 29290, durationSeconds: 1440,
  toll: { kind: 'priced', cents: 340, currency: 'USD' }, tollPass: 'EZ TAG', avoidTolls: false, tollsOffered: true, issuedAt: Date.now(), ...over,
});

test('route choices are signed: tampering, another job or a stale token is refused', () => {
  const token = signRouteChoice(choice());
  assert.equal(verifyRouteChoice(token, 'job-1')?.toll.kind, 'priced');
  assert.equal(verifyRouteChoice(token, 'job-2'), null, 'another job');
  const [body, mac] = token.split('.');
  const forged = Buffer.from(JSON.stringify({ ...choice(), toll: { kind: 'priced', cents: 99_999, currency: 'USD' } })).toString('base64url');
  assert.equal(verifyRouteChoice(`${forged}.${mac}`, 'job-1'), null, 'a changed amount');
  assert.equal(verifyRouteChoice(`${body}.x${mac.slice(1)}`, 'job-1'), null);
  assert.equal(verifyRouteChoice(signRouteChoice(choice({ issuedAt: Date.now() - 13 * 3600_000 })), 'job-1'), null, 'stale');
  assert.equal(verifyRouteChoice(undefined, 'job-1'), null);
  assert.equal(verifyRouteChoice('nope', 'job-1'), null);

  const tokens = withChoiceTokens('job-1', [opt('a', { kind: 'priced', cents: 340, currency: 'USD' }), opt('b', { kind: 'none' })], { avoidTolls: false });
  const b = verifyRouteChoice(tokens[1].choiceToken, 'job-1')!;
  assert.equal(b.tollsOffered, true, 'the toll-free pick knows a toll route was on offer');
  assert.equal(b.tollPass, null);
  assert.equal(verifyRouteChoice(tokens[0].choiceToken, 'job-1')!.tollPass, 'EZ TAG');
});

test('a choice becomes trip fields; avoided tolls only when tolls were on the table', () => {
  const priced = tripFieldsFromChoice(choice());
  assert.equal(priced.tollState, 'PRICED');
  assert.equal(priced.tollCents, 340);
  assert.equal(priced.avoidedTolls, false);
  assert.equal(priced.routeSummary, 'Fastest via Westpark Tollway · 18.2 mi · 24 min');
  const free = tripFieldsFromChoice(choice({ label: 'noTolls', toll: { kind: 'none' } }));
  assert.equal(free.tollState, 'NONE');
  assert.equal(free.tollCents, null);
  assert.equal(free.avoidedTolls, true);
  assert.equal(tripFieldsFromChoice(choice({ toll: { kind: 'none' }, tollsOffered: false })).avoidedTolls, false, 'no tolls anywhere is not "avoiding"');
  assert.equal(tripFieldsFromChoice(choice({ toll: { kind: 'none' }, tollsOffered: false, avoidTolls: true })).avoidedTolls, true);
  assert.equal(tripFieldsFromChoice(choice({ provider: 'mapbox', toll: { kind: 'unpriced' }, tollPass: null })).tollState, 'UNPRICED');
});

test('drive time is only kept when believable', () => {
  const t0 = new Date('2026-10-06T14:00:00Z');
  assert.equal(actualDriveSeconds(t0, new Date('2026-10-06T14:24:00Z')), 1440);
  assert.equal(actualDriveSeconds(t0, new Date('2026-10-06T14:00:10Z')), null, 'tapped twice in a row');
  assert.equal(actualDriveSeconds(t0, new Date('2026-10-06T23:00:00Z')), null, 'left open all day');
});

test('travel summary by team: miles, time, tolls, avoidance, planned vs actual', () => {
  const row = (over: Partial<TripRow>): TripRow => ({
    crewId: 'c1', crewName: 'Team A', plannedDistanceMeters: 16093, plannedDurationSeconds: 1200, actualDurationSeconds: 1500,
    tollState: 'NONE', tollCents: null, avoidedTolls: false, ...over,
  });
  const rows = [
    row({ tollState: 'PRICED', tollCents: 340 }),
    row({ avoidedTolls: true }),
    row({ actualDurationSeconds: null, tollState: 'UNPRICED' }),
    row({ crewId: 'c2', crewName: 'Team B', plannedDistanceMeters: null, plannedDurationSeconds: null, actualDurationSeconds: 600, tollState: 'UNKNOWN' }),
  ];
  const { total, teams } = summarizeByTeam(rows);
  assert.equal(total.trips, 4);
  assert.equal(total.miles, 30);
  assert.equal(total.driveMinutes, Math.round((1500 + 1500 + 1200 + 600) / 60));
  assert.equal(total.tollsCents, 340);
  assert.equal(total.tollTrips, 2);
  assert.equal(total.unpricedTollTrips, 1);
  assert.equal(total.avoidedPct, 33, '1 of 3 trips with a toll option');
  assert.equal(teams[0].name, 'Team A');
  assert.equal(teams[0].trips, 3);
  assert.equal(teams[0].plannedMinutes, 20);
  assert.equal(teams[0].actualMinutes, 25);
  assert.equal(teams[0].comparedTrips, 2);
  assert.equal(teams[1].avoidedPct, null);
  assert.equal(teams[1].averageTripMinutes, 10);
  assert.equal(teams[1].plannedMinutes, null);
  const empty = summarizeTrips([], null, 'All teams');
  assert.equal(empty.trips, 0);
  assert.equal(empty.averageTripMinutes, null);
});

test('directions: Google with tolls, plus the toll-free route; Mapbox when Google fails', async () => {
  process.env.GOOGLE_MAPS_API_KEY = 'maps-key';
  process.env.MAPBOX_SERVER_TOKEN = 'mb-token';
  const calls: { url: string; body?: any; headers?: any }[] = [];
  const tollOnly = { routes: [googleResponse.routes[0]] };
  const tollFree = { routes: [{ ...googleResponse.routes[1], routeLabels: ['DEFAULT_ROUTE'] }] };
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url: String(url), body, headers: init?.headers });
    return Response.json(body?.routeModifiers?.avoidTolls ? tollFree : tollOnly);
  }) as typeof fetch;
  const q = { from: { lat: 29.78, lng: -95.82 }, to: { lat: 29.73, lng: -95.55 }, avoidTolls: false, lang: 'es' as const, arriveText: 'Has llegado.', alternatives: true };
  const result = await fetchRouteOptions(q);
  assert.equal(result?.provider, 'google');
  assert.deepEqual(result?.options.map((o) => [o.label, o.toll.kind]), [['fastest', 'priced'], ['noTolls', 'none']]);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].headers['X-Goog-Api-Key'], 'maps-key');
  assert.match(calls[0].headers['X-Goog-FieldMask'], /routes\.travelAdvisory\.tollInfo/);
  assert.deepEqual(calls[0].body.extraComputations, ['TOLLS']);
  assert.deepEqual(calls[0].body.routeModifiers, { avoidTolls: false, tollPasses: ['US_TX_EZTAG'] });
  assert.equal(calls[0].body.computeAlternativeRoutes, true);
  assert.equal(calls[0].body.languageCode, 'es');
  assert.equal(calls[1].body.computeAlternativeRoutes, false);

  // Google down → Mapbox, which avoids tolls with exclude=toll.
  calls.length = 0;
  globalThis.fetch = (async (url: string) => {
    calls.push({ url: String(url) });
    if (String(url).includes('googleapis')) return new Response('quota', { status: 429 });
    return Response.json(mapboxResponse);
  }) as typeof fetch;
  const fallback = await fetchRouteOptions({ ...q, avoidTolls: true });
  assert.equal(fallback?.provider, 'mapbox');
  assert.match(calls[1].url, /exclude=toll/);
  assert.match(calls[1].url, /language=es/);
  assert.deepEqual(fallback?.options.map((o) => o.toll.kind), ['none', 'unpriced'], 'toll-free first when avoiding');

  // Nothing reachable: null, never a throw.
  globalThis.fetch = (async () => {
    throw new TypeError('network down');
  }) as typeof fetch;
  assert.equal(await fetchRouteOptions(q), null);

  // No Google key: straight to Mapbox.
  delete process.env.GOOGLE_MAPS_API_KEY;
  calls.length = 0;
  globalThis.fetch = (async (url: string) => {
    calls.push({ url: String(url) });
    return Response.json(mapboxResponse);
  }) as typeof fetch;
  const mb = await fetchRouteOptions(q);
  assert.equal(mb?.provider, 'mapbox');
  assert.ok(calls.every((c) => c.url.includes('api.mapbox.com')));
});
