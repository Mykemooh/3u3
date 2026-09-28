import { db } from '@/db/client';
import { jobs, addresses } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { JobError, loadJob, requireWorkable, type Viewer } from '@/lib/jobs';
import { logNotification } from '@/lib/bookings';
import { sendEmail, crewEnRouteCustomerEmail } from '@/lib/email';
import { appUrl } from '@/lib/url';
import { formatClock } from '@/lib/time';

/**
 * "Cleaner en route" + the client's live map. The crew taps Start driving
 * (job → EN_ROUTE), their phone reports its position every ~20 seconds,
 * and the client's booking page polls getTracking() for the latest
 * position, the route and an ETA.
 *
 * Mapbox usage is kept well inside the free tier (100k directions and 100k
 * geocoding requests a month) by doing every Mapbox call here, on the
 * server, and caching the result for the trip: the client's address is
 * geocoded once per trip (kept on the job, and wiped on arrival — Mapbox's
 * free geocoding allows temporary use only), and the route is re-fetched
 * at most once a minute no matter how many people are watching the map.
 * The client's polls only read the database. The one call the browser
 * makes itself is the map load.
 */

/** Seconds between Directions calls for one trip. */
const ROUTE_REFRESH_SECONDS = 60;

// The public token (pk.…) is also what the browser uses to draw the map.
// If it's URL-restricted in the Mapbox dashboard, Mapbox rejects it from
// the server (no matching Referer), so an optional separate token can be
// set for these server-side calls.
function serverToken() {
  return process.env.MAPBOX_SERVER_TOKEN || process.env.MAPBOX_ACCESS_TOKEN || '';
}

/** The token handed to the browser for Mapbox GL JS — must be a public pk.… token. */
export function publicMapboxToken() {
  return process.env.MAPBOX_ACCESS_TOKEN || '';
}

type LngLat = { lat: number; lng: number };

export function isValidLngLat(v: unknown): v is LngLat {
  const p = v as LngLat;
  return (
    !!p &&
    typeof p.lat === 'number' &&
    typeof p.lng === 'number' &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lng) <= 180
  );
}

type TripJob = Pick<typeof jobs.$inferSelect, 'id' | 'destLat' | 'destLng' | 'routeUpdatedAt'>;

/**
 * The client's address as a point for this trip: geocoded on first use and
 * kept on the job until the crew arrives (lib/jobs.ts clears it).
 */
async function destinationFor(job: TripJob, addressId: string | null): Promise<LngLat | null> {
  if (job.destLat != null && job.destLng != null) return { lat: job.destLat, lng: job.destLng };
  if (!addressId) return null;
  const address = (await db.select().from(addresses).where(eq(addresses.id, addressId)).limit(1))[0];
  if (!address) return null;

  const token = serverToken();
  if (!token) return null;
  const q = `${address.line1}, ${address.city}, ${address.state}${address.zip ? ` ${address.zip}` : ''}`;
  try {
    const res = await fetch(
      `https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(q)}&country=us&limit=1&types=address&access_token=${token}`,
    );
    if (!res.ok) {
      console.error('[tracking] geocoding failed:', res.status, await res.text());
      return null;
    }
    const data = await res.json();
    const [lng, lat] = data?.features?.[0]?.geometry?.coordinates ?? [];
    // Only an exact address match: a street- or ZIP-level guess can be
    // miles off and would show the client a wrong route and ETA.
    if (!isValidLngLat({ lat, lng })) {
      console.warn(`[tracking] no address match for "${q}" — the live map will show the crew without a route or ETA.`);
      return null;
    }
    await db.update(jobs).set({ destLat: lat, destLng: lng }).where(eq(jobs.id, job.id));
    return { lat, lng };
  } catch (err) {
    console.error('[tracking] geocoding failed:', err);
    return null;
  }
}

/** One Mapbox Directions call: the driving route and its duration, with live traffic. */
async function fetchRoute(from: LngLat, to: LngLat) {
  const token = serverToken();
  if (!token) return null;
  try {
    const res = await fetch(
      `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${from.lng},${from.lat};${to.lng},${to.lat}?geometries=geojson&overview=full&access_token=${token}`,
    );
    if (!res.ok) {
      console.error('[tracking] directions failed:', res.status, await res.text());
      return null;
    }
    const route = (await res.json())?.routes?.[0];
    if (!route?.geometry) return null;
    return { geojson: JSON.stringify(route.geometry), durationSeconds: Math.round(route.duration) };
  } catch (err) {
    console.error('[tracking] directions failed:', err);
    return null;
  }
}

/**
 * Store the crew's position, and refresh the cached route when it's stale.
 * Returns the ETA if one is known.
 */
async function saveLocation(job: TripJob, bookingAddressId: string | null, at: LngLat, force = false) {
  const now = new Date();
  const patch: Partial<typeof jobs.$inferInsert> = { crewLat: at.lat, crewLng: at.lng, crewLocationAt: now };
  const stale = !job.routeUpdatedAt || now.getTime() - job.routeUpdatedAt.getTime() >= ROUTE_REFRESH_SECONDS * 1000;
  if (force || stale) {
    const destination = await destinationFor(job, bookingAddressId);
    const route = destination ? await fetchRoute(at, destination) : null;
    if (route) {
      patch.routeGeojson = route.geojson;
      patch.routeDurationSeconds = route.durationSeconds;
      patch.routeUpdatedAt = now;
    }
  }
  await db.update(jobs).set(patch).where(eq(jobs.id, job.id));
  return patch;
}

/**
 * The crew taps "Start driving": job → EN_ROUTE, and the client is told
 * their crew is on the way. Idempotent — tapping again doesn't re-notify.
 * `at` is the crew's position when they tapped, if the phone gave one, so
 * the notification can carry an ETA from the start.
 */
export async function startDriving(jobId: string, viewer: Viewer | null, at: LngLat | null) {
  const job = await requireWorkable(jobId, viewer);
  if (job.status === 'COMPLETE') throw new JobError('This job is already finished', 409);
  if (job.status === 'IN_PROGRESS') throw new JobError('This job has already started', 409);
  if (job.status === 'EN_ROUTE') return { status: job.status, enRouteAt: job.enRouteAt };

  const enRouteAt = new Date();
  await db.update(jobs).set({ status: 'EN_ROUTE', enRouteAt }).where(eq(jobs.id, jobId));

  let etaSeconds: number | null = null;
  if (at) {
    const data = await loadJob(jobId);
    const saved = await saveLocation(job, data?.booking.addressId ?? null, at, true);
    etaSeconds = saved.routeDurationSeconds ?? null;
  }

  try {
    await notifyEnRoute(jobId, etaSeconds);
  } catch (err) {
    console.error('[tracking] en-route notifications failed for job', jobId, err);
  }
  return { status: 'EN_ROUTE' as const, enRouteAt };
}

/** A position report from the crew's phone while en route. */
export async function recordLocation(jobId: string, viewer: Viewer | null, at: LngLat) {
  const job = await requireWorkable(jobId, viewer);
  // Not an error: the phone may send one last report after the crew taps
  // "I've arrived". Tell it to stop rather than storing a position.
  if (job.status !== 'EN_ROUTE') return { tracking: false as const };
  const data = await loadJob(jobId);
  const saved = await saveLocation(job, data?.booking.addressId ?? null, at);
  return { tracking: true as const, etaSeconds: saved.routeDurationSeconds ?? job.routeDurationSeconds ?? null };
}

export type TrackingState =
  | { status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETE' }
  | {
      status: 'EN_ROUTE';
      enRouteAt: string | null;
      crew: (LngLat & { at: string }) | null;
      destination: LngLat | null;
      route: { type: 'LineString'; coordinates: [number, number][] } | null;
      /** When the crew is expected, from the last Directions result. */
      etaAt: string | null;
    };

/**
 * What the client's map polls. Callers must already have checked
 * canViewJob. Database only: the destination is geocoded by the crew's
 * location reports (at most once a minute), never by a poll.
 */
export function getTracking(job: typeof jobs.$inferSelect): TrackingState {
  if (job.status !== 'EN_ROUTE') return { status: job.status };
  const destination = job.destLat != null && job.destLng != null ? { lat: job.destLat, lng: job.destLng } : null;
  let route: Extract<TrackingState, { status: 'EN_ROUTE' }>['route'] = null;
  try {
    route = job.routeGeojson ? JSON.parse(job.routeGeojson) : null;
  } catch {
    route = null;
  }
  const etaAt =
    job.routeUpdatedAt && job.routeDurationSeconds != null
      ? new Date(job.routeUpdatedAt.getTime() + job.routeDurationSeconds * 1000).toISOString()
      : null;
  return {
    status: 'EN_ROUTE',
    enRouteAt: job.enRouteAt?.toISOString() ?? null,
    crew:
      job.crewLat != null && job.crewLng != null && job.crewLocationAt
        ? { lat: job.crewLat, lng: job.crewLng, at: job.crewLocationAt.toISOString() }
        : null,
    destination,
    route,
    etaAt,
  };
}

/**
 * Tell the client their crew is on the way. Email and the in-app banner
 * (the account pages read job.status directly) are live today; the other
 * channels are sketched below, ready to wire up.
 */
async function notifyEnRoute(jobId: string, etaSeconds: number | null) {
  const data = await loadJob(jobId);
  if (!data) return;
  const { booking, client } = data;
  const trackUrl = appUrl(`/account/jobs/${jobId}`);
  const etaLabel = etaSeconds != null ? formatClock(new Date(Date.now() + etaSeconds * 1000)) : null;

  // There's no per-client notification preference yet, so email always
  // goes out. When one is added to users (e.g. notification_channel:
  // 'EMAIL' | 'SMS' | 'WHATSAPP'), branch on it here and in the stubs below.
  if (client?.email) {
    const { subject, html } = crewEnRouteCustomerEmail({ name: client.name, etaLabel, trackUrl });
    const ok = await sendEmail({ to: client.email, subject, html });
    await logNotification({
      tenantId: booking.tenantId,
      channel: 'EMAIL',
      recipient: client.email,
      triggerEvent: ok ? 'CREW_EN_ROUTE_CUSTOMER' : 'CREW_EN_ROUTE_CUSTOMER_NOT_DELIVERED',
      relatedBookingId: booking.id,
    });
  }

  // --- SMS (not wired up) ------------------------------------------------
  // if (client?.phone && client.notificationChannel === 'SMS') {
  //   const ok = await sendSms({
  //     to: client.phone,
  //     body: `3U3 Cleaning: your crew is on the way${etaLabel ? `, arriving around ${etaLabel}` : ''}. Track them: ${trackUrl}`,
  //   });
  //   await logNotification({
  //     tenantId: booking.tenantId,
  //     channel: 'SMS',
  //     recipient: client.phone,
  //     triggerEvent: ok ? 'CREW_EN_ROUTE_CUSTOMER' : 'CREW_EN_ROUTE_CUSTOMER_NOT_DELIVERED',
  //     relatedBookingId: booking.id,
  //     costCents: /* provider's per-message cost */ 0,
  //   });
  // }

  // --- WhatsApp (not wired up) -------------------------------------------
  // WhatsApp business messages need a pre-approved template; the ETA and
  // tracking link go in as template variables. Needs 'WHATSAPP' added to
  // notification_log.channel's CHECK constraint before logging.
  // if (client?.phone && client.notificationChannel === 'WHATSAPP') {
  //   const ok = await sendWhatsAppTemplate({
  //     to: client.phone,
  //     template: 'crew_en_route',
  //     variables: [client.name.split(' ')[0], etaLabel ?? 'shortly', trackUrl],
  //   });
  //   await logNotification({ tenantId: booking.tenantId, channel: 'WHATSAPP', ... });
  // }
}
