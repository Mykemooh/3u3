'use client';

import { useEffect, useRef, useState } from 'react';
import type { Map as MapboxMap, LngLatLike } from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { currentPosition } from '@/lib/useLocationReporter';

type LngLat = { lat: number; lng: number };
type Coord = [number, number];
const ROUTE_COLOR = '#2563EB';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; crew: LngLat | null; destination: LngLat | null; addressLabel: string | null; route: Coord[] | null; distanceMiles: number | null; durationMinutes: number | null };

/**
 * The crew's own in-app view of the drive to the job — not just a
 * hand-off to another app. Fetches the destination from the server
 * (geocoded fresh, never persisted outside an actual EN_ROUTE trip —
 * lib/tracking.ts), gets the phone's own position, and draws the route
 * with the same Mapbox GL setup the client's live-tracking map uses
 * (components/app/LiveTrackingMap.tsx), one-shot rather than polling.
 * "Start navigation" still hands off to the device's own maps app below
 * — turn-by-turn voice guidance isn't something a web map can do, so
 * this is the honest split: see the route here, navigate there.
 */
export default function CrewDirectionsMap({ jobId, addressLabel: fallbackAddressLabel }: { jobId: string; addressLabel: string | null }) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapboxMap | null>(null);

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

        let route: Coord[] | null = null;
        let distanceMiles: number | null = null;
        let durationMinutes: number | null = null;
        if (crew && destination) {
          const res = await fetch(
            `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${crew.lng},${crew.lat};${destination.lng},${destination.lat}?geometries=geojson&overview=full&access_token=${token}`,
          );
          if (res.ok) {
            const data = await res.json();
            const best = data?.routes?.[0];
            if (best?.geometry?.coordinates) {
              route = best.geometry.coordinates;
              distanceMiles = Math.round((best.distance / 1609.34) * 10) / 10;
              durationMinutes = Math.max(1, Math.round(best.duration / 60));
            }
          }
        }
        if (cancelled) return;
        setState({ status: 'ready', crew, destination, addressLabel: dir.addressLabel ?? fallbackAddressLabel, route, distanceMiles, durationMinutes });

        const mapboxgl = (await import('mapbox-gl')).default;
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
        m.on('load', () => {
          if (route) {
            m.addSource('route', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: route } } });
            m.addLayer({ id: 'route-casing', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 9 } });
            m.addLayer({ id: 'route-line', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': ROUTE_COLOR, 'line-width': 5 } });
          }
          if (crew) new mapboxgl.Marker({ color: ROUTE_COLOR }).setLngLat(crew).addTo(m);
          if (destination) new mapboxgl.Marker({ color: '#0B1F3B' }).setLngLat(destination).addTo(m);
          if (points.length >= 2) {
            const lngs = points.map((p) => p[0]);
            const lats = points.map((p) => p[1]);
            m.fitBounds(
              [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
              { padding: 48, maxZoom: 15, duration: 0 },
            );
          } else if (points.length === 1) {
            m.setCenter(points[0]);
            m.setZoom(14);
          }
        });
        map.current = m;
      } catch (err) {
        if (!cancelled) setState({ status: 'error', message: 'Could not load directions.' });
      }
    })();
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
  }, [jobId, fallbackAddressLabel]);

  if (state.status === 'loading') {
    return <div className="flex h-72 items-center justify-center rounded-xl bg-surface text-sm text-muted">Loading directions…</div>;
  }
  if (state.status === 'error') {
    return <p className="rounded-xl bg-surface px-4 py-6 text-center text-sm text-slate">{state.message}</p>;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-line">
      {(state.distanceMiles != null || state.durationMinutes != null) && (
        <div className="flex items-center justify-between gap-4 bg-cream px-4 py-2.5 text-sm">
          <span className="font-semibold text-ink">{state.addressLabel}</span>
          <span className="shrink-0 font-semibold text-bronze">
            {state.durationMinutes != null && `${state.durationMinutes} min`}
            {state.distanceMiles != null && ` · ${state.distanceMiles} mi`}
          </span>
        </div>
      )}
      <div ref={container} className="h-64 w-full sm:h-72" role="region" aria-label="Map to the job address" />
      {!state.crew && (
        <p className="border-t border-line px-4 py-2 text-xs text-slate">Couldn't get your location — showing the destination only.</p>
      )}
    </div>
  );
}
