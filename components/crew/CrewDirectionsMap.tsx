'use client';

import { useEffect, useRef, useState } from 'react';
import type { Map as MapboxMap, Marker, GeoJSONSource, LngLatLike } from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { currentPosition } from '@/lib/useLocationReporter';
import {
  type NavStep, type Coord, parseSteps, distanceMeters, bearingBetween, distanceToRoute,
  maneuverArrowRotation, formatDistance, ANNOUNCE_THRESHOLDS_METERS,
} from '@/lib/turnByTurn';

type LngLat = { lat: number; lng: number };
const ROUTE_COLOR = '#016AEE'; // brand vivid blue — matches gold.DEFAULT in tailwind.config.ts
const ARRIVAL_RADIUS_M = 40;
const STEP_ADVANCE_RADIUS_M = 25;
const OFF_ROUTE_M = 100;
const OFF_ROUTE_STRIKES = 3;

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; crew: LngLat | null; destination: LngLat | null; addressLabel: string | null; route: Coord[] | null; distanceMiles: number | null; durationMinutes: number | null; hasSteps: boolean };

/**
 * The crew's own in-app turn-by-turn — not just a route preview, and not
 * a hand-off to another app. Mapbox's Directions API (steps=true)
 * returns each maneuver and where it happens; this watches the phone's
 * live position, announces each one by voice as it approaches (Web
 * Speech API), advances through them, reroutes if the driver wanders
 * off the line, and detects arrival — a real, if lesser, substitute for
 * Google/Apple/Waze's own turn-by-turn.
 *
 * Honest limit, not fixable from here: this is a web page, so it only
 * navigates while the tab is open and the screen is on — no background
 * operation behind a lock screen like a native nav app. A Screen Wake
 * Lock is requested during active navigation specifically to cover the
 * realistic case (phone propped up, screen on, tab in front).
 */
export default function CrewDirectionsMap({ jobId, addressLabel: fallbackAddressLabel }: { jobId: string; addressLabel: string | null }) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapboxMap | null>(null);
  const mapboxglRef = useRef<any>(null);
  const mapLoadedRef = useRef(false);
  const crewMarker = useRef<Marker | null>(null);
  const destMarker = useRef<Marker | null>(null);
  const followCamera = useRef(true);

  const tokenRef = useRef('');
  const destinationRef = useRef<LngLat | null>(null);
  const routeRef = useRef<Coord[]>([]);
  const stepsRef = useRef<NavStep[]>([]);
  const stepIndexRef = useRef(0);
  const announcedRef = useRef<Set<string>>(new Set());
  const offRouteStrikesRef = useRef(0);
  const lastPointRef = useRef<Coord | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const wakeLockRef = useRef<any>(null);
  const voiceOnRef = useRef(true);

  const [navActive, setNavActive] = useState(false);
  const [arrived, setArrived] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [stepIndexDisplay, setStepIndexDisplay] = useState(0);
  const [distanceToStep, setDistanceToStep] = useState<number | null>(null);
  const [rerouting, setRerouting] = useState(false);

  useEffect(() => {
    voiceOnRef.current = voiceOn;
  }, [voiceOn]);

  // Initial load: destination + an in-app route with steps, drawn once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [dirRes, crew] = await Promise.all([fetch(`/api/crew/jobs/${jobId}/directions`), currentPosition()]);
        if (cancelled) return;
        const dir = await dirRes.json();
        if (!dirRes.ok) {
          setState({ status: 'error', message: dir.error || 'Could not load directions.' });
          return;
        }
        const destination: LngLat | null = dir.destination;
        const token: string = dir.mapboxToken;
        if (!token) {
          setState({ status: 'error', message: 'Maps are not set up yet.' });
          return;
        }
        tokenRef.current = token;
        destinationRef.current = destination;

        let route: Coord[] | null = null;
        let distanceMiles: number | null = null;
        let durationMinutes: number | null = null;
        let hasSteps = false;
        if (crew && destination) {
          const res = await fetch(
            `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${crew.lng},${crew.lat};${destination.lng},${destination.lat}?geometries=geojson&overview=full&steps=true&access_token=${token}`,
          );
          if (res.ok) {
            const data = await res.json();
            const best = data?.routes?.[0];
            if (best?.geometry?.coordinates) {
              route = best.geometry.coordinates;
              distanceMiles = Math.round((best.distance / 1609.34) * 10) / 10;
              durationMinutes = Math.max(1, Math.round(best.duration / 60));
              routeRef.current = route ?? [];
              stepsRef.current = parseSteps(best.legs?.[0]?.steps ?? []);
              hasSteps = stepsRef.current.length > 0;
            }
          }
        }
        if (cancelled) return;
        setState({ status: 'ready', crew, destination, addressLabel: dir.addressLabel ?? fallbackAddressLabel, route, distanceMiles, durationMinutes, hasSteps });

        const mapboxgl = (await import('mapbox-gl')).default;
        mapboxglRef.current = mapboxgl;
        if (cancelled || !container.current) return;
        mapboxgl.accessToken = token;
        const points: Coord[] = [...(route ?? []), ...(crew ? [[crew.lng, crew.lat] as Coord] : []), ...(destination ? [[destination.lng, destination.lat] as Coord] : [])];
        const center: LngLatLike = crew ?? destination ?? { lat: 29.7858, lng: -95.8245 };
        const m = new mapboxgl.Map({
          container: container.current,
          style: 'mapbox://styles/mapbox/streets-v12',
          center,
          zoom: 12,
          attributionControl: false,
          cooperativeGestures: true,
        });
        m.addControl(new mapboxgl.AttributionControl({ compact: true }));
        m.on('dragstart', () => (followCamera.current = false));
        m.on('load', () => {
          mapLoadedRef.current = true;
          drawRouteOnMap(route, crew, destination);
          if (points.length >= 2) {
            const lngs = points.map((p) => p[0]);
            const lats = points.map((p) => p[1]);
            m.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 48, maxZoom: 15, duration: 0 });
          } else if (points.length === 1) {
            m.setCenter(points[0]);
            m.setZoom(14);
          }
        });
        map.current = m;
      } catch {
        if (!cancelled) setState({ status: 'error', message: 'Could not load directions.' });
      }
    })();
    return () => {
      cancelled = true;
      stopNavigation();
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, fallbackAddressLabel]);

  /** Adds (first time) or refreshes (retry) the route line and markers on an already-created map. Safe to call more than once. */
  function drawRouteOnMap(route: Coord[] | null, crew: LngLat | null, destination: LngLat | null) {
    const m = map.current;
    const mapboxgl = mapboxglRef.current;
    if (!m || !mapboxgl) return;
    if (route && route.length > 0) {
      const existing = m.getSource('route') as GeoJSONSource | undefined;
      const data = { type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: route } };
      if (existing) {
        existing.setData(data);
      } else {
        m.addSource('route', { type: 'geojson', data });
        m.addLayer({ id: 'route-casing', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 9 } });
        m.addLayer({ id: 'route-line', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': ROUTE_COLOR, 'line-width': 5 } });
      }
    }
    if (crew) {
      if (crewMarker.current) crewMarker.current.setLngLat(crew);
      else crewMarker.current = new mapboxgl.Marker({ color: ROUTE_COLOR }).setLngLat(crew).addTo(m);
    }
    if (destination && !destMarker.current) {
      destMarker.current = new mapboxgl.Marker({ color: '#041730' }).setLngLat(destination).addTo(m);
    }
  }

  /** Geolocation can fail on first load (permission prompt still pending, slow GPS fix) without being a permanent no — this re-tries it and, on success, fetches the route it couldn't before. */
  async function retryLocation() {
    const destination = destinationRef.current;
    const token = tokenRef.current;
    if (!destination || !token) return;
    const crew = await currentPosition(12000);
    if (!crew) return;
    try {
      const res = await fetch(
        `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${crew.lng},${crew.lat};${destination.lng},${destination.lat}?geometries=geojson&overview=full&steps=true&access_token=${token}`,
      );
      if (!res.ok) return;
      const data = await res.json();
      const best = data?.routes?.[0];
      if (!best?.geometry?.coordinates) return;
      const route: Coord[] = best.geometry.coordinates;
      routeRef.current = route;
      stepsRef.current = parseSteps(best.legs?.[0]?.steps ?? []);
      const distanceMiles = Math.round((best.distance / 1609.34) * 10) / 10;
      const durationMinutes = Math.max(1, Math.round(best.duration / 60));
      setState((s) => (s.status === 'ready' ? { ...s, crew, route, distanceMiles, durationMinutes, hasSteps: stepsRef.current.length > 0 } : s));
      if (mapLoadedRef.current) drawRouteOnMap(route, crew, destination);
      else map.current?.once('load', () => drawRouteOnMap(route, crew, destination));
    } catch {
      // Still no luck — the retry button stays, nothing else to do here.
    }
  }

  function speak(text: string) {
    if (!voiceOnRef.current || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
    } catch {
      // Speech synthesis can be unavailable or blocked — the on-screen banner still carries the instruction.
    }
  }

  async function reroute(from: Coord) {
    const dest = destinationRef.current;
    const token = tokenRef.current;
    if (!dest || !token || rerouting) return;
    setRerouting(true);
    try {
      const res = await fetch(
        `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${from[0]},${from[1]};${dest.lng},${dest.lat}?geometries=geojson&overview=full&steps=true&access_token=${token}`,
      );
      if (res.ok) {
        const data = await res.json();
        const best = data?.routes?.[0];
        if (best?.geometry?.coordinates) {
          routeRef.current = best.geometry.coordinates;
          stepsRef.current = parseSteps(best.legs?.[0]?.steps ?? []);
          stepIndexRef.current = 0;
          setStepIndexDisplay(0);
          announcedRef.current = new Set();
          speak('Rerouting.');
          const src = map.current?.getSource('route') as GeoJSONSource | undefined;
          src?.setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: routeRef.current } });
        }
      }
    } catch {
      // Keep the existing route if a reroute fetch fails — stale directions beat none.
    } finally {
      setRerouting(false);
    }
  }

  function onPosition(pos: GeolocationPosition) {
    const point: Coord = [pos.coords.longitude, pos.coords.latitude];
    const m = map.current;

    if (m) {
      // Geolocation may have failed on the initial load (denied, or just
      // slow) but succeed now via watchPosition — create the marker on
      // first fix rather than silently never showing one.
      if (!crewMarker.current && mapboxglRef.current) {
        crewMarker.current = new mapboxglRef.current.Marker({ color: ROUTE_COLOR }).setLngLat(point).addTo(m);
      } else if (crewMarker.current) {
        if (!crewMarker.current.getElement().isConnected) crewMarker.current.setLngLat(point).addTo(m);
        else crewMarker.current.setLngLat(point);
      }
    }
    if (m && followCamera.current) {
      const bearing = pos.coords.heading != null && !Number.isNaN(pos.coords.heading) ? pos.coords.heading : lastPointRef.current ? bearingBetween(lastPointRef.current, point) : undefined;
      m.easeTo({ center: point, bearing, pitch: 55, zoom: 17, duration: 700 });
    }
    lastPointRef.current = point;

    const dest = destinationRef.current;
    if (dest) {
      const distToDest = distanceMeters(point, [dest.lng, dest.lat]);
      if (distToDest < ARRIVAL_RADIUS_M) {
        speak('You have arrived.');
        setArrived(true);
        stopNavigation();
        return;
      }
    }

    const steps = stepsRef.current;
    const idx = stepIndexRef.current;
    if (idx < steps.length) {
      const target = steps[idx].location;
      const d = distanceMeters(point, target);
      setDistanceToStep(d);

      for (const threshold of ANNOUNCE_THRESHOLDS_METERS) {
        const key = `${idx}:${threshold}`;
        if (d <= threshold && !announcedRef.current.has(key)) {
          announcedRef.current.add(key);
          speak(threshold <= 30 ? steps[idx].instruction : `In ${formatDistance(d)}, ${steps[idx].instruction}`);
        }
      }

      if (d < STEP_ADVANCE_RADIUS_M && idx < steps.length - 1) {
        stepIndexRef.current = idx + 1;
        setStepIndexDisplay(idx + 1);
      }
    }

    const offDist = distanceToRoute(point, routeRef.current);
    if (offDist > OFF_ROUTE_M) {
      offRouteStrikesRef.current += 1;
      if (offRouteStrikesRef.current >= OFF_ROUTE_STRIKES) {
        offRouteStrikesRef.current = 0;
        void reroute(point);
      }
    } else {
      offRouteStrikesRef.current = 0;
    }
  }

  async function startNavigation() {
    if (stepsRef.current.length === 0) return;
    setArrived(false);
    stepIndexRef.current = 0;
    setStepIndexDisplay(0);
    announcedRef.current = new Set();
    offRouteStrikesRef.current = 0;
    followCamera.current = true;
    setNavActive(true);
    speak(stepsRef.current[0].instruction);

    if ('wakeLock' in navigator) {
      try {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
      } catch {
        // Wake lock can be denied (low battery, unsupported) — navigation still works, the screen just might sleep.
      }
    }
    if (navigator.geolocation) {
      watchIdRef.current = navigator.geolocation.watchPosition(onPosition, () => {}, { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 });
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
    setNavActive(false);
    map.current?.easeTo({ pitch: 0, bearing: 0, duration: 500 });
    followCamera.current = true;
  }

  if (state.status === 'loading') {
    return <div className="flex h-72 items-center justify-center rounded-xl bg-surface text-sm text-muted">Loading directions…</div>;
  }
  if (state.status === 'error') {
    return <p className="rounded-xl bg-surface px-4 py-6 text-center text-sm text-slate">{state.message}</p>;
  }

  const currentStep = stepsRef.current[stepIndexDisplay];

  return (
    <div className="overflow-hidden rounded-xl border border-line">
      {navActive && currentStep && !arrived && (
        <div className="flex items-center gap-3 bg-ink px-4 py-3 text-white">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-xl"
            style={{ transform: `rotate(${maneuverArrowRotation(currentStep)}deg)` }}
          >
            {currentStep.type === 'arrive' ? '🏁' : '↑'}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-bold leading-tight">{currentStep.instruction}</p>
            {distanceToStep != null && <p className="text-xs text-white/70">{formatDistance(distanceToStep)}{rerouting ? ' · rerouting…' : ''}</p>}
          </div>
          <button type="button" onClick={() => setVoiceOn((v) => !v)} aria-label={voiceOn ? 'Mute voice guidance' : 'Unmute voice guidance'} className="shrink-0 text-lg">
            {voiceOn ? '🔊' : '🔇'}
          </button>
        </div>
      )}

      {arrived && (
        <div className="bg-emerald-600 px-4 py-3 text-center font-bold text-white">🏁 You've arrived</div>
      )}

      {!navActive && !arrived && (state.distanceMiles != null || state.durationMinutes != null) && (
        <div className="flex items-center justify-between gap-4 bg-cream px-4 py-2.5 text-sm">
          <span className="font-semibold text-ink">{state.addressLabel}</span>
          <span className="shrink-0 font-semibold text-bronze">
            {state.durationMinutes != null && `${state.durationMinutes} min`}
            {state.distanceMiles != null && ` · ${state.distanceMiles} mi`}
          </span>
        </div>
      )}

      <div ref={container} className="h-64 w-full sm:h-72" role="region" aria-label="Map to the job address" />

      {!state.crew && !navActive && (
        <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2">
          <p className="text-xs text-slate">Couldn't get your location — showing the destination only.</p>
          <button type="button" onClick={retryLocation} className="shrink-0 text-xs font-semibold text-bronze hover:underline">
            Try again
          </button>
        </div>
      )}

      <div className="flex items-center gap-2 border-t border-line p-3">
        {navActive ? (
          <button type="button" onClick={stopNavigation} className="btn-secondary w-full !py-2 text-sm">
            End navigation
          </button>
        ) : arrived ? (
          <button type="button" onClick={() => setArrived(false)} className="btn-secondary w-full !py-2 text-sm">
            Done
          </button>
        ) : (
          <button type="button" onClick={startNavigation} disabled={!state.hasSteps} className="btn-primary w-full !py-2 text-sm disabled:opacity-50">
            {state.hasSteps ? 'Start in-app navigation' : "Couldn't load turn-by-turn"}
          </button>
        )}
      </div>
    </div>
  );
}
