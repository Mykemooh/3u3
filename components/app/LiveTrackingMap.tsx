'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Map as MapboxMap, Marker, GeoJSONSource, LngLatLike } from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { TrackingState } from '@/lib/tracking';

type EnRoute = Extract<TrackingState, { status: 'EN_ROUTE' }>;
type Coord = [number, number];

const POLL_MS = 15_000;
const ROUTE_COLOR = '#016AEE'; // brand vivid blue — matches gold.DEFAULT in tailwind.config.ts
// A position older than this is shown as "last updated …" rather than live.
const STALE_MS = 2 * 60_000;

/**
 * The client's Uber-style view while their crew is driving over: the
 * crew's live position, their home, the road between them and an ETA.
 * Polls /api/account/jobs/[id]/tracking (a database read — Mapbox is only
 * hit for the map tiles) and, the moment the job stops being EN_ROUTE,
 * refreshes the page so the normal booking view takes over.
 */
export default function LiveTrackingMap({ jobId, token, initial }: { jobId: string; token: string; initial: EnRoute }) {
  const router = useRouter();
  const [state, setState] = useState<EnRoute>(initial);
  const [now, setNow] = useState(() => Date.now());
  const [mapFailed, setMapFailed] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapboxMap | null>(null);
  const crewMarker = useRef<Marker | null>(null);
  const homeMarker = useRef<Marker | null>(null);
  const followCamera = useRef(true);
  const mapReady = useRef(false);

  // Poll for the latest position; hand back to the server-rendered page
  // once the trip is over (arrived, or anything else).
  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/account/jobs/${jobId}/tracking`, { cache: 'no-store' });
        if (!res.ok || stopped) return;
        const next: TrackingState = await res.json();
        if (next.status !== 'EN_ROUTE') {
          stopped = true;
          router.refresh();
          return;
        }
        setState(next);
      } catch {
        // Offline for a moment — the next tick will catch up.
      }
    };
    const poll = setInterval(tick, POLL_MS);
    const clock = setInterval(() => setNow(Date.now()), 30_000);
    const onVisible = () => document.visibilityState === 'visible' && tick();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      clearInterval(poll);
      clearInterval(clock);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [jobId, router]);

  // Create the map once.
  useEffect(() => {
    if (!token || !container.current) return;
    let cancelled = false;
    (async () => {
      try {
        const mapboxgl = (await import('mapbox-gl')).default;
        if (cancelled || !container.current) return;
        mapboxgl.accessToken = token;
        const center: LngLatLike = initial.crew ?? initial.destination ?? { lat: 29.7858, lng: -95.8245 };
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
        m.on('error', (e) => console.error('[map]', e.error));
        m.on('load', () => {
          m.addSource('route', { type: 'geojson', data: lineFeature([]) });
          m.addLayer({
            id: 'route-casing',
            type: 'line',
            source: 'route',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': '#ffffff', 'line-width': 9 },
          });
          m.addLayer({
            id: 'route-line',
            type: 'line',
            source: 'route',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': ROUTE_COLOR, 'line-width': 5 },
          });
          crewMarker.current = new mapboxgl.Marker({ element: crewDot() });
          homeMarker.current = new mapboxgl.Marker({ element: homePin(), anchor: 'bottom' });
          map.current = m;
          mapReady.current = true;
          setState((s) => ({ ...s })); // draw the first frame
        });
      } catch (err) {
        console.error('[map] failed to load', err);
        setMapFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      mapReady.current = false;
      map.current?.remove();
      map.current = null;
    };
    // The map is created once; later state goes through the effect below.
  }, [token]);

  // Draw the latest state onto the map.
  useEffect(() => {
    const m = map.current;
    if (!m || !mapReady.current) return;
    const crew: Coord | null = state.crew ? [state.crew.lng, state.crew.lat] : null;
    const home: Coord | null = state.destination ? [state.destination.lng, state.destination.lat] : null;

    if (crew) {
      const marker = crewMarker.current!;
      if (!marker.getElement().isConnected) marker.setLngLat(crew).addTo(m);
      else glide(marker, crew);
    }
    if (home && !homeMarker.current!.getElement().isConnected) homeMarker.current!.setLngLat(home).addTo(m);

    const remaining = crew ? remainingRoute(state.route?.coordinates ?? [], crew) : state.route?.coordinates ?? [];
    (m.getSource('route') as GeoJSONSource | undefined)?.setData(lineFeature(remaining));

    if (followCamera.current) {
      const points = [...remaining, ...(crew ? [crew] : []), ...(home ? [home] : [])];
      if (points.length >= 2) {
        const lngs = points.map((p) => p[0]);
        const lats = points.map((p) => p[1]);
        m.fitBounds(
          [
            [Math.min(...lngs), Math.min(...lats)],
            [Math.max(...lngs), Math.max(...lats)],
          ],
          { padding: 56, maxZoom: 15, duration: 800 },
        );
      } else if (points.length === 1) {
        m.easeTo({ center: points[0], zoom: 14 });
      }
    }
  }, [state]);

  const eta = state.etaAt ? new Date(state.etaAt) : null;
  const minutes = eta ? Math.max(1, Math.round((eta.getTime() - now) / 60_000)) : null;
  const lastSeenMs = state.crew ? now - new Date(state.crew.at).getTime() : null;
  const stale = lastSeenMs != null && lastSeenMs > STALE_MS;

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white">
      <div className="flex items-center justify-between gap-4 px-5 py-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: ROUTE_COLOR }} />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ background: ROUTE_COLOR }} />
            </span>
            Your crew is on the way
          </p>
          <p className="mt-0.5 text-sm text-slate" aria-live="polite">
            {!state.crew
              ? "Waiting for your crew's location…"
              : stale
              ? `Location last updated ${Math.round(lastSeenMs! / 60_000)} min ago`
              : 'Live location'}
          </p>
        </div>
        {eta && (
          <div className="shrink-0 text-right">
            <p className="text-2xl font-extrabold leading-none text-ink">{minutes} min</p>
            <p className="mt-1 text-xs font-semibold text-slate">
              Arriving ~{eta.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </p>
          </div>
        )}
      </div>
      {token && !mapFailed ? (
        <div ref={container} className="h-72 w-full sm:h-80" role="region" aria-label="Map of your crew's route to your home" />
      ) : (
        <p className="border-t border-line bg-surface px-5 py-4 text-sm text-slate">The live map isn't available right now — we'll email you if anything changes.</p>
      )}
    </div>
  );
}

function lineFeature(coordinates: Coord[]) {
  return { type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates } };
}

/**
 * The part of the route still ahead: drop everything up to the vertex
 * nearest the crew and start the line at their marker. The route itself
 * is only re-fetched once a minute, so this is what makes the line shrink
 * smoothly behind the crew between refreshes.
 */
function remainingRoute(route: Coord[], crew: Coord): Coord[] {
  if (route.length < 2) return route;
  let best = 0;
  let bestD = Infinity;
  const cosLat = Math.cos((crew[1] * Math.PI) / 180);
  route.forEach(([lng, lat], i) => {
    const d = ((lng - crew[0]) * cosLat) ** 2 + (lat - crew[1]) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return [crew, ...route.slice(best + 1)];
}

/** Slide a marker to its new position over a second instead of jumping. */
function glide(marker: Marker, to: Coord) {
  const from = marker.getLngLat();
  const start = performance.now();
  const step = (t: number) => {
    const k = Math.min(1, (t - start) / 1000);
    marker.setLngLat([from.lng + (to[0] - from.lng) * k, from.lat + (to[1] - from.lat) * k]);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function crewDot() {
  const el = document.createElement('div');
  el.setAttribute('aria-label', 'Your crew');
  el.style.cssText = `width:22px;height:22px;border-radius:9999px;background:${ROUTE_COLOR};border:4px solid #fff;box-shadow:0 0 0 6px rgba(1,106,238,.25),0 2px 6px rgba(0,0,0,.3);`;
  return el;
}

function homePin() {
  const el = document.createElement('div');
  el.setAttribute('aria-label', 'Your home');
  el.innerHTML = `<svg width="34" height="42" viewBox="0 0 34 42" aria-hidden="true"><path d="M17 41s15-13.2 15-24A15 15 0 0 0 2 17c0 10.8 15 24 15 24Z" fill="#041730" stroke="#fff" stroke-width="2"/><path d="M10 18.5 17 12l7 6.5V25h-4.5v-4h-5v4H10z" fill="#fff"/></svg>`;
  return el;
}
