'use client';

import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import type { Map as MapboxMap, Marker, GeoJSONSource } from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { currentPosition } from '@/lib/useLocationReporter';
import {
  type NavStep, type Coord, distanceMeters, bearingBetween, distanceToRoute,
  maneuverArrowRotation, formatDistance, ANNOUNCE_THRESHOLDS_METERS,
} from '@/lib/turnByTurn';
import { type RouteOption, type RouteLabel, metersToMiles, secondsToMinutes } from '@/lib/routeOptions';
import { useLocale, useT } from '@/components/i18n/LocaleProvider';
import { intlLocale } from '@/lib/i18n';
import { crewMessages } from '@/lib/i18n/messages/crew';

type LngLat = { lat: number; lng: number };
type ClientRoute = RouteOption & { choiceToken: string };

const ROUTE_COLOR = '#016AEE'; // brand vivid blue — matches gold.DEFAULT in tailwind.config.ts
const ALT_ROUTE_COLOR = '#94A3B8';
const DEFAULT_CENTER: LngLat = { lat: 29.7858, lng: -95.8245 }; // Katy, TX
const ARRIVAL_RADIUS_M = 40;
const STEP_ADVANCE_RADIUS_M = 25;
const OFF_ROUTE_M = 100;
const OFF_ROUTE_STRIKES = 3;
const REROUTE_MIN_INTERVAL_MS = 20_000;
const MAP_LOAD_TIMEOUT_MS = 20_000;
const AVOID_TOLLS_KEY = 'crew.directions.avoidTolls';

type Setup =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; token: string; destination: LngLat | null; addressLabel: string | null };

type Routes =
  | { status: 'locating' }
  | { status: 'noLocation' }
  | { status: 'loading'; previous: ClientRoute[] }
  | { status: 'error' }
  | { status: 'ready'; routes: ClientRoute[]; tollPass: string | null };

const LABEL_KEYS: Record<RouteLabel, 'mapRouteFastest' | 'mapRouteAlternate' | 'mapRouteShorter' | 'mapRouteFuel' | 'mapRouteNoTolls'> = {
  fastest: 'mapRouteFastest',
  alternate: 'mapRouteAlternate',
  shorter: 'mapRouteShorter',
  fuel: 'mapRouteFuel',
  noTolls: 'mapRouteNoTolls',
};

function readAvoidTolls(): boolean {
  try {
    return window.localStorage.getItem(AVOID_TOLLS_KEY) === '1';
  } catch {
    return false;
  }
}

function lineFeatures(routes: { id: string; geometry: Coord[] }[]) {
  return {
    type: 'FeatureCollection' as const,
    features: routes.map((r) => ({ type: 'Feature' as const, properties: { id: r.id }, geometry: { type: 'LineString' as const, coordinates: r.geometry } })),
  };
}

/**
 * The crew's own in-app turn-by-turn — not just a route preview, and not
 * a hand-off to another app. The server (GET /api/crew/jobs/[id]/directions,
 * lib/directions.ts) returns the route choices with their tolls — priced
 * by Google's Routes API when it's set up, Mapbox otherwise — each with its
 * maneuvers. The crew picks one (or flips "Avoid tolls"), and this watches
 * the phone's live position, announces each maneuver by voice as it
 * approaches (Web Speech API), advances through them, reroutes if the
 * driver wanders off the line, and detects arrival.
 *
 * Starting navigation records the trip and, for a priced toll route, its
 * toll expense (POST /api/crew/jobs/[id]/trip, lib/trips.ts).
 *
 * Honest limit, not fixable from here: this is a web page, so it only
 * navigates while the tab is open and the screen is on — no background
 * operation behind a lock screen like a native nav app. A Screen Wake
 * Lock is held during navigation (and re-taken when the tab comes back)
 * to cover the realistic case: phone propped up, screen on, tab in front.
 *
 * Layout never jumps: the map box has a fixed height from the first
 * render, and loading / error states are drawn inside it.
 */
export default function CrewDirectionsMap({ jobId, addressLabel: fallbackAddressLabel }: { jobId: string; addressLabel: string | null }) {
  const t = useT(crewMessages);
  const locale = useLocale();
  // The server writes the turn-by-turn instructions in this language.
  const navLang = locale === 'es' ? 'es' : 'en';

  const [setup, setSetup] = useState<Setup>({ status: 'loading' });
  const [crew, setCrew] = useState<LngLat | null>(null);
  const [routes, setRoutes] = useState<Routes>({ status: 'locating' });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [avoidTolls, setAvoidTolls] = useState(false);

  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapAttempt, setMapAttempt] = useState(0);

  const [navActive, setNavActive] = useState(false);
  const [arrived, setArrived] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [following, setFollowing] = useState(true);
  const [stepIndexDisplay, setStepIndexDisplay] = useState(0);
  const [distanceToStep, setDistanceToStep] = useState<number | null>(null);
  const [rerouting, setRerouting] = useState(false);
  const [gpsIssue, setGpsIssue] = useState<'denied' | 'waiting' | null>(null);

  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapboxMap | null>(null);
  const mapboxglRef = useRef<any>(null);
  const crewMarker = useRef<Marker | null>(null);
  const destMarker = useRef<Marker | null>(null);
  const followRef = useRef(true);

  const destinationRef = useRef<LngLat | null>(null);
  const crewRef = useRef<LngLat | null>(null);
  const avoidTollsRef = useRef(false);
  const selectedRef = useRef<ClientRoute | null>(null);
  const routeGeomRef = useRef<Coord[]>([]);
  const stepsRef = useRef<NavStep[]>([]);
  const stepIndexRef = useRef(0);
  const announcedRef = useRef<Set<string>>(new Set());
  const offRouteStrikesRef = useRef(0);
  const lastPointRef = useRef<Coord | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const wakeLockRef = useRef<any>(null);
  const voiceOnRef = useRef(true);
  const navActiveRef = useRef(false);
  const reroutingRef = useRef(false);
  const lastRerouteAtRef = useRef(0);
  const arrivalReportedRef = useRef(false);
  const routesRequestRef = useRef(0);
  const routesAbortRef = useRef<AbortController | null>(null);
  const setupRequestRef = useRef(0);
  const selectRouteRef = useRef<(id: string) => void>(() => {});

  const routeList: ClientRoute[] = routes.status === 'ready' ? routes.routes : routes.status === 'loading' ? routes.previous : [];
  const selected = routeList.find((r) => r.id === selectedId) ?? routeList[0] ?? null;
  selectedRef.current = selected;
  selectRouteRef.current = (id: string) => {
    if (!navActiveRef.current) setSelectedId(id);
  };

  useEffect(() => {
    voiceOnRef.current = voiceOn;
  }, [voiceOn]);

  useEffect(() => {
    avoidTollsRef.current = avoidTolls;
  }, [avoidTolls]);

  // ---------------------------------------------------------------- data

  /** One directions call. With a position it includes the route choices. */
  async function fetchDirections(from: LngLat | null, opts: { avoidTolls: boolean; alternatives?: boolean; signal?: AbortSignal }) {
    const params = new URLSearchParams({ lang: navLang });
    if (from) {
      params.set('lat', String(from.lat));
      params.set('lng', String(from.lng));
      if (opts.avoidTolls) params.set('avoidTolls', '1');
      if (opts.alternatives === false) params.set('alt', '0');
    }
    const res = await fetch(`/api/crew/jobs/${jobId}/directions?${params}`, { signal: opts.signal });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || t('mapLoadError'));
    return data as {
      destination: LngLat | null;
      addressLabel: string | null;
      mapboxToken: string;
      routes: ClientRoute[] | null;
      tollPass?: string | null;
    };
  }

  /** The route choices from `from`; the previous list stays on screen (dimmed) while it loads. */
  async function loadRoutes(from: LngLat, avoid: boolean) {
    const requestId = ++routesRequestRef.current;
    routesAbortRef.current?.abort();
    const controller = new AbortController();
    routesAbortRef.current = controller;
    setRoutes((r) => ({ status: 'loading', previous: r.status === 'ready' ? r.routes : r.status === 'loading' ? r.previous : [] }));
    try {
      const data = await fetchDirections(from, { avoidTolls: avoid, signal: controller.signal });
      if (requestId !== routesRequestRef.current) return;
      if (!data.routes) {
        setRoutes({ status: 'error' });
        return;
      }
      setRoutes({ status: 'ready', routes: data.routes, tollPass: data.tollPass ?? null });
      setSelectedId(data.routes[0]?.id ?? null);
    } catch (err) {
      if ((err as Error)?.name === 'AbortError' || requestId !== routesRequestRef.current) return;
      setRoutes({ status: 'error' });
    }
  }

  /** Destination, map token and (once the phone gives a position) the routes. Also the Retry for the whole panel. */
  async function load() {
    const requestId = ++setupRequestRef.current;
    setSetup({ status: 'loading' });
    setRoutes({ status: 'locating' });
    const avoid = readAvoidTolls();
    setAvoidTolls(avoid);
    avoidTollsRef.current = avoid;
    const positionPromise = currentPosition();
    try {
      const data = await fetchDirections(null, { avoidTolls: avoid });
      if (requestId !== setupRequestRef.current) return;
      if (!data.mapboxToken) {
        setSetup({ status: 'error', message: t('mapNotSetUp') });
        return;
      }
      destinationRef.current = data.destination;
      setSetup({ status: 'ready', token: data.mapboxToken, destination: data.destination, addressLabel: data.addressLabel ?? fallbackAddressLabel });
    } catch (err) {
      if (requestId === setupRequestRef.current) setSetup({ status: 'error', message: (err as Error)?.message || t('mapLoadError') });
      return;
    }
    const position = await positionPromise;
    if (requestId !== setupRequestRef.current) return;
    crewRef.current = position;
    setCrew(position);
    if (!position) {
      setRoutes({ status: 'noLocation' });
      return;
    }
    if (!destinationRef.current) {
      setRoutes({ status: 'error' });
      return;
    }
    await loadRoutes(position, avoid);
  }

  useEffect(() => {
    void load();
    return () => {
      // Anything still in flight belongs to a panel that's gone.
      setupRequestRef.current += 1;
      routesRequestRef.current += 1;
      routesAbortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  /** Geolocation can fail on first load (permission prompt still pending, slow GPS fix) without being a permanent no. */
  async function retryLocation() {
    setRoutes({ status: 'locating' });
    const position = await currentPosition(12000);
    crewRef.current = position;
    setCrew(position);
    if (!position) {
      setRoutes({ status: 'noLocation' });
      return;
    }
    if (!destinationRef.current) {
      setRoutes({ status: 'error' });
      return;
    }
    await loadRoutes(position, avoidTollsRef.current);
  }

  function retryRoutes() {
    const from = crewRef.current;
    if (from) void loadRoutes(from, avoidTollsRef.current);
    else void retryLocation();
  }

  function toggleAvoidTolls() {
    const next = !avoidTolls;
    setAvoidTolls(next);
    avoidTollsRef.current = next;
    try {
      window.localStorage.setItem(AVOID_TOLLS_KEY, next ? '1' : '0');
    } catch {
      // Private mode / blocked storage: the switch just isn't remembered.
    }
    if (crewRef.current && destinationRef.current) void loadRoutes(crewRef.current, next);
  }

  // ----------------------------------------------------------------- map

  const token = setup.status === 'ready' ? setup.token : null;

  // Create the map once there's a token; one instance per token/attempt,
  // fully torn down (markers, observers, timers) on cleanup.
  useEffect(() => {
    if (!token || !container.current) return;
    let cancelled = false;
    let instance: MapboxMap | null = null;
    let loaded = false;
    let resizeObserver: ResizeObserver | null = null;
    const loadTimer = window.setTimeout(() => {
      if (!loaded && !cancelled) setMapError(t('mapStyleError'));
    }, MAP_LOAD_TIMEOUT_MS);

    (async () => {
      try {
        const mapboxgl = (await import('mapbox-gl')).default;
        if (cancelled || !container.current) return;
        mapboxglRef.current = mapboxgl;
        mapboxgl.accessToken = token;
        const start = crewRef.current ?? destinationRef.current ?? DEFAULT_CENTER;
        const m = new mapboxgl.Map({
          container: container.current,
          style: 'mapbox://styles/mapbox/streets-v12',
          center: start,
          zoom: 12,
          attributionControl: false,
          cooperativeGestures: true,
        });
        instance = m;
        map.current = m;
        m.addControl(new mapboxgl.AttributionControl({ compact: true }));
        m.on('dragstart', () => {
          followRef.current = false;
          setFollowing(false);
        });
        // Before the style loads, an error (bad/expired token, no signal)
        // means there will be no map — say so instead of a blank box.
        // After it, errors are missing tiles and fix themselves.
        m.on('error', (e: any) => {
          if (loaded || cancelled) return;
          console.error('[directions] map error', e?.error ?? e);
          const status = e?.error?.status;
          if (status === 401 || status === 403 || status === 404) setMapError(t('mapStyleError'));
        });
        m.once('load', () => {
          if (cancelled) return;
          loaded = true;
          window.clearTimeout(loadTimer);
          m.addSource('route-alts', { type: 'geojson', data: lineFeatures([]) });
          m.addSource('route', { type: 'geojson', data: lineFeatures([]) });
          m.addLayer({ id: 'route-alts-line', type: 'line', source: 'route-alts', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': ALT_ROUTE_COLOR, 'line-width': 5, 'line-opacity': 0.8 } });
          // A wide invisible line so an alternate is easy to tap with a thumb.
          m.addLayer({ id: 'route-alts-hit', type: 'line', source: 'route-alts', paint: { 'line-color': '#000000', 'line-width': 24, 'line-opacity': 0 } });
          m.addLayer({ id: 'route-casing', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 9 } });
          m.addLayer({ id: 'route-line', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': ROUTE_COLOR, 'line-width': 5 } });
          m.on('click', 'route-alts-hit', (e: any) => {
            const id = e?.features?.[0]?.properties?.id;
            if (typeof id === 'string') selectRouteRef.current(id);
          });
          m.resize();
          setMapError(null);
          setMapReady(true);
        });
        // The sheet animates in and phones rotate: keep the canvas matched to its box.
        if (typeof ResizeObserver !== 'undefined') {
          resizeObserver = new ResizeObserver(() => instance?.resize());
          resizeObserver.observe(container.current);
        }
      } catch (err) {
        // WebGL unavailable, or the map script failed to load.
        console.error('[directions] map failed to start', err);
        if (!cancelled) setMapError(t('mapStyleError'));
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(loadTimer);
      resizeObserver?.disconnect();
      crewMarker.current?.remove();
      destMarker.current?.remove();
      crewMarker.current = null;
      destMarker.current = null;
      instance?.remove();
      map.current = null;
      setMapReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, mapAttempt]);

  function retryMap() {
    setMapError(null);
    setMapAttempt((n) => n + 1);
  }

  /** Puts a marker at `at`, creating it on this map if needed. */
  function placeMarker(ref: MutableRefObject<Marker | null>, at: LngLat | Coord, color: string) {
    const m = map.current;
    const gl = mapboxglRef.current;
    if (!m || !gl) return;
    if (ref.current) ref.current.setLngLat(at as any);
    else ref.current = new gl.Marker({ color }).setLngLat(at).addTo(m);
  }

  // Markers: the crew (where the phone was last seen) and the job.
  useEffect(() => {
    if (!mapReady) return;
    const destination = setup.status === 'ready' ? setup.destination : null;
    if (destination) placeMarker(destMarker, destination, '#041730');
    if (crew && !navActiveRef.current) placeMarker(crewMarker, crew, ROUTE_COLOR);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, crew, setup]);

  // Route lines: the picked one in blue, the others grey (tap to pick).
  // Framed to fit while choosing; during navigation the camera follows the driver instead.
  const routesKey = routeList.map((r) => `${r.id}:${r.geometry.length}:${r.durationSeconds}:${r.geometry[0]?.join(',')}`).join('|');
  useEffect(() => {
    const m = map.current;
    if (!mapReady || !m) return;
    const sel = selectedRef.current;
    const alts = navActive ? [] : routeList.filter((r) => r !== sel);
    (m.getSource('route-alts') as GeoJSONSource | undefined)?.setData(lineFeatures(alts));
    (m.getSource('route') as GeoJSONSource | undefined)?.setData(lineFeatures(sel ? [sel] : []));
    if (navActive) return;
    const dest = destinationRef.current;
    const points: Coord[] = [
      ...(sel?.geometry ?? []),
      ...(crewRef.current ? [[crewRef.current.lng, crewRef.current.lat] as Coord] : []),
      ...(dest ? [[dest.lng, dest.lat] as Coord] : []),
    ];
    if (points.length >= 2) {
      const lngs = points.map((p) => p[0]);
      const lats = points.map((p) => p[1]);
      m.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 40, maxZoom: 15, duration: 0 });
    } else if (points.length === 1) {
      m.jumpTo({ center: points[0], zoom: 14 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, routesKey, selected?.id, navActive, crew]);

  // ---------------------------------------------------------- navigation

  function speak(text: string) {
    if (!voiceOnRef.current || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = intlLocale(locale);
      window.speechSynthesis.speak(utterance);
    } catch {
      // Speech synthesis can be unavailable or blocked — the on-screen banner still carries the instruction.
    }
  }

  /** Off the line: a fresh single route from here, keeping the toll choice (a toll-free pick stays toll-free). */
  async function reroute(from: Coord) {
    const now = Date.now();
    if (reroutingRef.current || now - lastRerouteAtRef.current < REROUTE_MIN_INTERVAL_MS) return;
    reroutingRef.current = true;
    lastRerouteAtRef.current = now;
    setRerouting(true);
    try {
      const current = selectedRef.current;
      const avoid = avoidTollsRef.current || current?.toll.kind === 'none';
      const data = await fetchDirections({ lng: from[0], lat: from[1] }, { avoidTolls: avoid, alternatives: false });
      const best = data.routes?.[0];
      if (!best || !navActiveRef.current) return;
      routeGeomRef.current = best.geometry;
      stepsRef.current = best.steps;
      stepIndexRef.current = 0;
      setStepIndexDisplay(0);
      announcedRef.current = new Set();
      speak(t('mapSpeakRerouting'));
      const keepId = current?.id ?? best.id;
      // Same id and label as the pick: the line redraws, the trip record stays as chosen.
      setRoutes((r) =>
        r.status === 'ready' ? { ...r, routes: r.routes.map((x) => (x.id === keepId ? { ...best, id: keepId, label: x.label, choiceToken: x.choiceToken } : x)) } : r,
      );
    } catch {
      // Keep the existing route if a reroute fetch fails — stale directions beat none.
    } finally {
      reroutingRef.current = false;
      setRerouting(false);
    }
  }

  function onPosition(pos: GeolocationPosition) {
    setGpsIssue(null);
    const point: Coord = [pos.coords.longitude, pos.coords.latitude];
    const m = map.current;
    if (m) placeMarker(crewMarker, point, ROUTE_COLOR);
    if (m && followRef.current) {
      const heading = pos.coords.heading;
      const bearing = heading != null && !Number.isNaN(heading) ? heading : lastPointRef.current ? bearingBetween(lastPointRef.current, point) : undefined;
      m.easeTo({ center: point, bearing, pitch: 55, zoom: 17, duration: 700 });
    }
    lastPointRef.current = point;
    crewRef.current = { lng: point[0], lat: point[1] };

    const dest = destinationRef.current;
    if (dest && distanceMeters(point, [dest.lng, dest.lat]) < ARRIVAL_RADIUS_M) {
      speak(t('mapSpeakArrived'));
      setArrived(true);
      reportArrival();
      stopNavigation();
      return;
    }

    const steps = stepsRef.current;
    const idx = stepIndexRef.current;
    if (idx < steps.length) {
      const d = distanceMeters(point, steps[idx].location);
      setDistanceToStep(d);
      for (const threshold of ANNOUNCE_THRESHOLDS_METERS) {
        const key = `${idx}:${threshold}`;
        if (d <= threshold && !announcedRef.current.has(key)) {
          announcedRef.current.add(key);
          speak(threshold <= 30 ? steps[idx].instruction : t('mapSpeakIn', { distance: formatDistance(d), instruction: steps[idx].instruction }));
        }
      }
      if (d < STEP_ADVANCE_RADIUS_M && idx < steps.length - 1) {
        stepIndexRef.current = idx + 1;
        setStepIndexDisplay(idx + 1);
      }
    }

    if (distanceToRoute(point, routeGeomRef.current) > OFF_ROUTE_M) {
      offRouteStrikesRef.current += 1;
      if (offRouteStrikesRef.current >= OFF_ROUTE_STRIKES) {
        offRouteStrikesRef.current = 0;
        void reroute(point);
      }
    } else {
      offRouteStrikesRef.current = 0;
    }
  }

  // The geolocation watch calls through this ref, so it always runs the
  // latest render's handler — never a stale closure from when it started.
  const onPositionRef = useRef(onPosition);
  onPositionRef.current = onPosition;

  function onPositionError(err: GeolocationPositionError) {
    // Denied is final until the crew changes the setting; anything else
    // (timeout, no fix yet in a parking garage) clears on the next fix.
    setGpsIssue(err.code === err.PERMISSION_DENIED ? 'denied' : 'waiting');
  }

  async function acquireWakeLock() {
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator) || wakeLockRef.current) return;
    try {
      const lock = await (navigator as any).wakeLock.request('screen');
      if (!navActiveRef.current) {
        lock.release?.().catch(() => {});
        return;
      }
      wakeLockRef.current = lock;
      lock.addEventListener?.('release', () => {
        if (wakeLockRef.current === lock) wakeLockRef.current = null;
      });
    } catch {
      // Wake lock can be denied (low battery, unsupported) — navigation still works, the screen just might sleep.
    }
  }

  /** Records the drive (and a toll route's expense). Never blocks or fails navigation. */
  function reportTripStart(route: ClientRoute) {
    void fetch(`/api/crew/jobs/${jobId}/trip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ choiceToken: route.choiceToken }),
    }).catch(() => {});
  }

  function reportArrival() {
    if (arrivalReportedRef.current) return;
    arrivalReportedRef.current = true;
    void fetch(`/api/crew/jobs/${jobId}/trip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ arrived: true }),
    }).catch(() => {});
  }

  function startNavigation() {
    const route = selectedRef.current;
    if (!route || route.steps.length === 0) return;
    routeGeomRef.current = route.geometry;
    stepsRef.current = route.steps;
    setArrived(false);
    arrivalReportedRef.current = false;
    stepIndexRef.current = 0;
    setStepIndexDisplay(0);
    setDistanceToStep(null);
    announcedRef.current = new Set();
    offRouteStrikesRef.current = 0;
    lastRerouteAtRef.current = 0;
    followRef.current = true;
    setFollowing(true);
    navActiveRef.current = true;
    setNavActive(true);
    setGpsIssue(null);
    speak(route.steps[0].instruction);
    reportTripStart(route);
    void acquireWakeLock();
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      watchIdRef.current = navigator.geolocation.watchPosition((p) => onPositionRef.current(p), onPositionError, {
        enableHighAccuracy: true,
        maximumAge: 2000,
        timeout: 15000,
      });
    } else {
      setGpsIssue('denied');
    }
  }

  function stopNavigation() {
    if (watchIdRef.current != null) {
      navigator.geolocation?.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    wakeLockRef.current?.release?.().catch(() => {});
    wakeLockRef.current = null;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    navActiveRef.current = false;
    setNavActive(false);
    setGpsIssue(null);
    if (crewRef.current) setCrew({ ...crewRef.current });
    map.current?.easeTo({ pitch: 0, bearing: 0, duration: 500 });
    followRef.current = true;
    setFollowing(true);
  }

  function recenter() {
    followRef.current = true;
    setFollowing(true);
    const p = lastPointRef.current;
    if (p) map.current?.easeTo({ center: p, pitch: 55, zoom: 17, duration: 500 });
  }

  // A wake lock is dropped whenever the tab is hidden; take it back on return.
  useEffect(() => {
    if (!navActive) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') void acquireWakeLock();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navActive]);

  // Closing the sheet ends navigation: no GPS watch, wake lock or voice left running.
  const stopRef = useRef(stopNavigation);
  stopRef.current = stopNavigation;
  useEffect(() => {
    return () => {
      if (navActiveRef.current) stopRef.current();
    };
  }, []);

  // -------------------------------------------------------------- render

  const money = (cents: number, currency: string) =>
    new Intl.NumberFormat(intlLocale(locale), { style: 'currency', currency: currency || 'USD' }).format(cents / 100);

  function tollText(route: ClientRoute) {
    if (route.toll.kind === 'priced') return route.toll.cents > 0 ? t('mapTollsPriced', { amount: money(route.toll.cents, route.toll.currency) }) : t('mapTollsNone');
    if (route.toll.kind === 'unpriced') return t('mapTollsUnpriced');
    return t('mapTollsNone');
  }
  const hasToll = (route: ClientRoute) => route.toll.kind === 'unpriced' || (route.toll.kind === 'priced' && route.toll.cents > 0);

  const destination = setup.status === 'ready' ? setup.destination : null;
  const addressLabel = setup.status === 'ready' ? setup.addressLabel : fallbackAddressLabel;
  const currentStep = navActive ? stepsRef.current[stepIndexDisplay] : undefined;
  const routesBusy = routes.status === 'loading' || routes.status === 'locating';
  const tollPass = routes.status === 'ready' ? routes.tollPass : null;
  const anyPricedToll = routeList.some((r) => r.toll.kind === 'priced' && r.toll.cents > 0);

  const overlay =
    setup.status === 'loading' ? (
      <p className="text-sm text-muted" role="status">{t('mapLoading')}</p>
    ) : setup.status === 'error' ? (
      <div className="space-y-3 px-6 text-center" role="alert">
        <p className="text-sm text-slate">{setup.message}</p>
        <button type="button" onClick={() => void load()} className="btn-secondary !px-4 !py-2 text-sm">
          {t('mapRetry')}
        </button>
      </div>
    ) : mapError ? (
      <div className="space-y-3 px-6 text-center" role="alert">
        <p className="text-sm text-slate">{mapError}</p>
        <button type="button" onClick={retryMap} className="btn-secondary !px-4 !py-2 text-sm">
          {t('mapRetry')}
        </button>
      </div>
    ) : !mapReady ? (
      <p className="text-sm text-muted" role="status">{t('mapLoading')}</p>
    ) : null;

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-white">
      {/* Top strip — one fixed-height slot for summary / next maneuver / arrival, so nothing below it moves. */}
      {navActive && currentStep ? (
        <div className="flex min-h-[60px] items-center gap-3 bg-ink px-4 py-2.5 text-white" aria-live="polite">
          <span
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 text-xl"
            style={{ transform: `rotate(${maneuverArrowRotation(currentStep)}deg)` }}
          >
            {currentStep.type === 'arrive' ? '🏁' : '↑'}
          </span>
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-base font-bold leading-tight">{currentStep.instruction}</p>
            <p className="text-xs text-white/70">
              {gpsIssue === 'denied'
                ? t('mapLocationDenied')
                : gpsIssue === 'waiting' || distanceToStep == null
                ? t('mapWaitingGps')
                : formatDistance(distanceToStep)}
              {rerouting ? ` · ${t('mapRerouting')}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setVoiceOn((v) => !v)}
            aria-label={voiceOn ? t('mapMute') : t('mapUnmute')}
            aria-pressed={!voiceOn}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg hover:bg-white/10"
          >
            {voiceOn ? '🔊' : '🔇'}
          </button>
        </div>
      ) : arrived ? (
        <div className="flex min-h-[60px] items-center justify-center bg-emerald-600 px-4 py-2.5 text-center font-bold text-white" role="status">
          🏁 {t('mapArrived')}
        </div>
      ) : (
        <div className="flex min-h-[60px] items-center justify-between gap-4 bg-cream px-4 py-2.5 text-sm">
          <span className="min-w-0 font-semibold text-ink">{addressLabel}</span>
          {selected && (
            <span className="shrink-0 text-right font-semibold text-bronze">
              {t('mapMinutes', { count: secondsToMinutes(selected.durationSeconds) })}
              <span className="block text-xs font-normal text-slate">{t('mapMiles', { count: metersToMiles(selected.distanceMeters) })}</span>
            </span>
          )}
        </div>
      )}

      <div className="relative h-64 w-full bg-surface sm:h-72">
        <div ref={container} className="absolute inset-0" role="region" aria-label={t('mapAria')} />
        {overlay && <div className="absolute inset-0 flex items-center justify-center bg-surface">{overlay}</div>}
        {navActive && !following && (
          <button
            type="button"
            onClick={recenter}
            className="absolute bottom-3 right-3 min-h-[44px] rounded-full bg-white px-4 text-sm font-semibold text-ink shadow-lg ring-1 ring-line"
          >
            {t('mapRecenter')}
          </button>
        )}
      </div>

      {setup.status === 'error' ? null : navActive ? (
        <div className="space-y-2 border-t border-line p-3">
          {selected && (
            <p className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate font-semibold text-ink">
                {t(LABEL_KEYS[selected.label])}
                {selected.summary && <span className="font-normal text-slate"> · {t('mapVia', { summary: selected.summary })}</span>}
              </span>
              <span className={`shrink-0 font-semibold ${hasToll(selected) ? 'text-amber-700' : 'text-green'}`}>{tollText(selected)}</span>
            </p>
          )}
          <button type="button" onClick={stopNavigation} className="btn-secondary min-h-[48px] w-full text-sm">
            {t('mapEndNav')}
          </button>
        </div>
      ) : (
        <div className="space-y-3 border-t border-line p-3">
          {setup.status === 'ready' && !destination && <p className="text-sm text-slate">{t('mapNoDestination')}</p>}

          {setup.status === 'ready' && destination && routes.status === 'noLocation' && (
            <div className="flex items-center justify-between gap-3 rounded-xl bg-cream px-4 py-3">
              <p className="text-sm text-slate">{t('mapNoLocation')}</p>
              <button type="button" onClick={() => void retryLocation()} className="min-h-[44px] shrink-0 px-2 text-sm font-semibold text-bronze hover:underline">
                {t('mapTryAgain')}
              </button>
            </div>
          )}

          {setup.status === 'ready' && destination && routes.status === 'error' && (
            <div className="flex items-center justify-between gap-3 rounded-xl bg-cream px-4 py-3" role="alert">
              <p className="text-sm text-slate">{t('mapRoutesError')}</p>
              <button type="button" onClick={retryRoutes} className="min-h-[44px] shrink-0 px-2 text-sm font-semibold text-bronze hover:underline">
                {t('mapRetry')}
              </button>
            </div>
          )}

          {(setup.status === 'loading' || destination !== null) && routes.status !== 'noLocation' && routes.status !== 'error' && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[13px] font-semibold text-tc-700">{t('mapRoutesTitle')}</p>
                {routesBusy && (
                  <p className="text-xs text-muted" role="status">
                    {routes.status === 'locating' ? t('mapLocating') : t('mapRoutesLoading')}
                  </p>
                )}
              </div>
              {routeList.length === 0 ? (
                routesBusy ? (
                  <div className="space-y-2" aria-hidden="true">
                    <div className="h-[72px] animate-pulse rounded-xl bg-surface" />
                    <div className="h-[72px] animate-pulse rounded-xl bg-surface" />
                  </div>
                ) : (
                  <p className="text-sm text-slate">{t('mapNoRoute')}</p>
                )
              ) : (
                <div role="radiogroup" aria-label={t('mapRoutesTitle')} className={`space-y-2 transition-opacity ${routesBusy ? 'pointer-events-none opacity-50' : ''}`}>
                  {routeList.map((r) => {
                    const isSelected = r.id === selected?.id;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        onClick={() => setSelectedId(r.id)}
                        className={`flex min-h-[72px] w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${
                          isSelected ? 'border-gold bg-gold/5 ring-1 ring-gold' : 'border-line bg-white hover:border-gold/60'
                        }`}
                      >
                        <span aria-hidden="true" className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${isSelected ? 'border-gold' : 'border-line'}`}>
                          {isSelected && <span className="h-2.5 w-2.5 rounded-full bg-gold" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold text-ink">{t(LABEL_KEYS[r.label])}</span>
                          {r.summary && <span className="block truncate text-xs text-slate">{t('mapVia', { summary: r.summary })}</span>}
                          <span className={`mt-0.5 block text-xs font-semibold ${hasToll(r) ? 'text-amber-700' : 'text-green'}`}>{tollText(r)}</span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block font-bold text-ink">{t('mapMinutes', { count: secondsToMinutes(r.durationSeconds) })}</span>
                          <span className="block text-xs text-slate">{t('mapMiles', { count: metersToMiles(r.distanceMeters) })}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {setup.status === 'ready' && destination && (
            <button
              type="button"
              role="switch"
              aria-checked={avoidTolls}
              onClick={toggleAvoidTolls}
              className="flex min-h-[52px] w-full items-center justify-between gap-3 rounded-xl border border-line px-4 py-2 text-left"
            >
              <span>
                <span className="block text-sm font-semibold text-ink">{t('mapAvoidTolls')}</span>
                <span className="block text-xs text-slate">{t('mapAvoidTollsHint')}</span>
              </span>
              <span aria-hidden="true" className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${avoidTolls ? 'bg-gold' : 'bg-line'}`}>
                <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${avoidTolls ? 'left-[22px]' : 'left-0.5'}`} />
              </span>
            </button>
          )}

          {anyPricedToll && tollPass && <p className="text-xs text-muted">{t('mapTollsPassNote', { pass: tollPass })}</p>}

          {arrived ? (
            <button type="button" onClick={() => setArrived(false)} className="btn-secondary min-h-[48px] w-full text-sm">
              {t('mapDone')}
            </button>
          ) : (
            <button
              type="button"
              onClick={startNavigation}
              disabled={!selected || selected.steps.length === 0 || routesBusy || !!mapError}
              className="btn-primary min-h-[48px] w-full text-sm disabled:opacity-50"
            >
              {routesBusy ? t('mapRoutesLoading') : selected && selected.steps.length === 0 ? t('mapNoTurnByTurn') : t('mapStartNav')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
