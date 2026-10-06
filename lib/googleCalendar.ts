import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { addresses, bookings, calendarConnections, calendarEventLinks, jobs, serviceTypes, users } from '@/db/schema';
import { jobIdsForEmployee } from '@/lib/team';
import { businessTodayISO, BUSINESS_TIMEZONE } from '@/lib/time';
import { appUrl } from '@/lib/url';
import { seal, unseal, sha256, randomToken } from '@/lib/secretBox';
import { logChange } from '@/lib/audit';

/**
 * Google Calendar sync — one way, from the schedule here to each staff
 * member's own Google Calendar.
 *
 * Each staff member connects their own Google account (same Google Cloud
 * project as "Continue with Google", with the Calendar API enabled; scope
 * calendar.events only). Their jobs — and, for office staff, walkthrough
 * visits — from yesterday through the next SYNC_DAYS days are kept as
 * events: added when booked, moved when rescheduled, removed when
 * cancelled, skipped or reassigned.
 *
 * Idempotent: each booking has a fixed event id on that calendar
 * ("tc" + the booking id's hex), and calendar_event_links remembers what
 * was last sent, so a re-sync only calls Google for what changed.
 * Nothing private to the home (entry codes, alarm codes) goes into an
 * event.
 */

export const SYNC_DAYS = 60;
const SCOPE = 'openid email https://www.googleapis.com/auth/calendar.events';
const API = 'https://www.googleapis.com/calendar/v3';

export class CalendarError extends Error {}

export function calendarConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim());
}

const redirectUri = () => appUrl('/api/calendar/google/callback');

export function newOAuthState() {
  return randomToken('', 16);
}

export function authorizeUrl(state: string): string {
  const id = process.env.GOOGLE_CLIENT_ID;
  if (!id) throw new CalendarError('GOOGLE_CLIENT_ID is not set');
  const params = new URLSearchParams({
    client_id: id,
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID ?? '', client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '', ...body }),
  });
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; id_token?: string; error?: string };
  if (!res.ok || !data.access_token) throw new CalendarError(data.error === 'invalid_grant' ? 'invalid_grant' : `Google token request failed (${res.status})`);
  return data;
}

/** The email in an id_token we just received from Google's token endpoint over TLS. */
function emailFromIdToken(idToken?: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from((idToken ?? '').split('.')[1] ?? '', 'base64url').toString('utf8'));
    return typeof payload.email === 'string' ? payload.email : null;
  } catch {
    return null;
  }
}

export async function connectCalendar(user: { id: string; tenantId: string; name?: string | null }, code: string) {
  const t = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri() });
  if (!t.refresh_token) throw new CalendarError('Google did not grant offline access. Please try connecting again.');
  const values = {
    tenantId: user.tenantId,
    accountEmail: emailFromIdToken(t.id_token),
    refreshToken: seal(t.refresh_token),
    accessToken: seal(t.access_token!),
    expiresAt: new Date(Date.now() + (t.expires_in ?? 3600) * 1000),
    lastError: null,
  };
  const [existing] = await db.select().from(calendarConnections).where(eq(calendarConnections.userId, user.id)).limit(1);
  if (existing) await db.update(calendarConnections).set(values).where(eq(calendarConnections.id, existing.id));
  else await db.insert(calendarConnections).values({ id: crypto.randomUUID(), userId: user.id, ...values });
  await logChange({ tenantId: user.tenantId, actor: { id: user.id, name: user.name }, entityType: 'integration', entityId: user.id, action: 'calendar_connected', summary: `Connected Google Calendar${values.accountEmail ? ` (${values.accountEmail})` : ''}` });
  await syncUserCalendar(user.id);
}

export async function calendarConnection(userId: string) {
  const [row] = await db.select().from(calendarConnections).where(eq(calendarConnections.userId, userId)).limit(1);
  if (!row) return null;
  return { accountEmail: row.accountEmail, lastSyncedAt: row.lastSyncedAt, lastError: row.lastError };
}

async function accessToken(conn: typeof calendarConnections.$inferSelect): Promise<string> {
  const current = unseal(conn.accessToken);
  if (current && conn.expiresAt && conn.expiresAt.getTime() > Date.now() + 60_000) return current;
  const refresh = unseal(conn.refreshToken);
  if (!refresh) throw new CalendarError('invalid_grant');
  const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: refresh });
  await db
    .update(calendarConnections)
    .set({ accessToken: seal(t.access_token!), expiresAt: new Date(Date.now() + (t.expires_in ?? 3600) * 1000) })
    .where(eq(calendarConnections.id, conn.id));
  return t.access_token!;
}

export const eventIdFor = (bookingId: string) => `tc${bookingId.replace(/-/g, '').toLowerCase()}`;

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** The bookings that belong on this person's calendar right now, with each event's content. */
export async function desiredEvents(userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return [];
  const from = addDays(businessTodayISO(), -1);
  const to = addDays(businessTodayISO(), SYNC_DAYS);

  const jobIds = await jobIdsForEmployee(userId);
  const jobRows = jobIds.length ? await db.select().from(jobs).where(inArray(jobs.id, jobIds)) : [];
  const jobByBooking = new Map(jobRows.map((j) => [j.bookingId, j]));
  let rows = jobRows.length ? await db.select().from(bookings).where(inArray(bookings.id, jobRows.map((j) => j.bookingId))) : [];
  if (user.role === 'ADMIN') {
    const visits = await db.select().from(bookings).where(and(eq(bookings.tenantId, user.tenantId), eq(bookings.isQuoteVisit, true)));
    rows = [...rows, ...visits.filter((v) => !rows.some((r) => r.id === v.id))];
  }
  rows = rows.filter((b) => b.tenantId === user.tenantId && b.status !== 'CANCELLED' && b.slotStart.slice(0, 10) >= from && b.slotStart.slice(0, 10) <= to);
  if (!rows.length) return [];

  const [clients, services, addrs] = await Promise.all([
    db.select({ id: users.id, name: users.name, phone: users.phone }).from(users).where(inArray(users.id, rows.map((b) => b.clientId))),
    db.select({ id: serviceTypes.id, name: serviceTypes.name }).from(serviceTypes).where(eq(serviceTypes.tenantId, user.tenantId)),
    db
      .select({ id: addresses.id, line1: addresses.line1, city: addresses.city, state: addresses.state, zip: addresses.zip })
      .from(addresses)
      .where(inArray(addresses.id, rows.map((b) => b.addressId).filter((x): x is string => !!x).concat(['-']))),
  ]);

  return rows.map((b) => {
    const client = clients.find((c) => c.id === b.clientId);
    const service = services.find((s) => s.id === b.serviceTypeId)?.name ?? 'Cleaning';
    const a = addrs.find((x) => x.id === b.addressId);
    const job = jobByBooking.get(b.id);
    const link = job ? appUrl(`/crew/jobs/${job.id}`) : appUrl('/admin/leads');
    const event = {
      summary: b.isQuoteVisit ? `Walkthrough: ${client?.name ?? 'Client'}` : `${service}: ${client?.name ?? 'Client'}`,
      location: a ? [a.line1, a.city, [a.state, a.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ') : undefined,
      description: [b.isQuoteVisit ? 'Walkthrough visit' : service, client?.phone ? `Client phone: ${client.phone}` : null, `Open: ${link}`].filter(Boolean).join('\n'),
      start: { dateTime: b.slotStart.length === 16 ? `${b.slotStart}:00` : b.slotStart, timeZone: BUSINESS_TIMEZONE },
      end: { dateTime: b.slotEnd.length === 16 ? `${b.slotEnd}:00` : b.slotEnd, timeZone: BUSINESS_TIMEZONE },
      status: 'confirmed',
      source: { title: 'TrashCan', url: link },
      reminders: { useDefault: true },
    };
    return { bookingId: b.id, eventId: eventIdFor(b.id), event, hash: sha256(JSON.stringify(event)) };
  });
}

async function google(token: string, method: string, path: string, body?: unknown) {
  return fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(8000),
  });
}

async function upsertEvent(token: string, calendarId: string, eventId: string, event: object) {
  const cal = encodeURIComponent(calendarId);
  let res = await google(token, 'PUT', `/calendars/${cal}/events/${eventId}`, event);
  if (res.status === 404) res = await google(token, 'POST', `/calendars/${cal}/events`, { id: eventId, ...event });
  if (!res.ok) throw new CalendarError(`Google Calendar refused an update (${res.status})`);
}

async function removeEvent(token: string, calendarId: string, eventId: string) {
  const res = await google(token, 'DELETE', `/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`);
  if (!res.ok && res.status !== 404 && res.status !== 410) throw new CalendarError(`Google Calendar refused a removal (${res.status})`);
}

/** Brings one person's Google Calendar in step. Returns what changed; never throws. */
export async function syncUserCalendar(userId: string): Promise<{ upserted: number; removed: number; error?: string }> {
  const [conn] = await db.select().from(calendarConnections).where(eq(calendarConnections.userId, userId)).limit(1);
  if (!conn || !calendarConfigured()) return { upserted: 0, removed: 0 };
  let upserted = 0;
  let removed = 0;
  try {
    const token = await accessToken(conn);
    const desired = await desiredEvents(userId);
    const links = await db.select().from(calendarEventLinks).where(eq(calendarEventLinks.userId, userId));
    const linkBy = new Map(links.map((l) => [l.bookingId, l]));

    for (const d of desired) {
      const link = linkBy.get(d.bookingId);
      if (link && link.contentHash === d.hash) continue;
      await upsertEvent(token, conn.calendarId, d.eventId, d.event);
      upserted++;
      if (link) await db.update(calendarEventLinks).set({ contentHash: d.hash, syncedAt: new Date() }).where(eq(calendarEventLinks.id, link.id));
      else await db.insert(calendarEventLinks).values({ id: crypto.randomUUID(), tenantId: conn.tenantId, userId, bookingId: d.bookingId, eventId: d.eventId, contentHash: d.hash });
    }

    // Anything linked that no longer belongs: cancelled, reassigned, or
    // moved past the window. Past visits that simply aged out stay put.
    const wanted = new Set(desired.map((d) => d.bookingId));
    const stale = links.filter((l) => !wanted.has(l.bookingId));
    if (stale.length) {
      const staleBookings = await db.select().from(bookings).where(inArray(bookings.id, stale.map((l) => l.bookingId)));
      const yesterday = addDays(businessTodayISO(), -1);
      for (const l of stale) {
        const b = staleBookings.find((x) => x.id === l.bookingId);
        const agedOut = b && b.status !== 'CANCELLED' && b.slotStart.slice(0, 10) < yesterday;
        if (agedOut) continue;
        await removeEvent(token, conn.calendarId, l.eventId);
        await db.delete(calendarEventLinks).where(eq(calendarEventLinks.id, l.id));
        removed++;
      }
    }
    await db.update(calendarConnections).set({ lastSyncedAt: new Date(), lastError: null }).where(eq(calendarConnections.id, conn.id));
    return { upserted, removed };
  } catch (err) {
    const msg = err instanceof Error && err.message === 'invalid_grant' ? 'Google access was removed. Connect Google Calendar again.' : err instanceof Error ? err.message : 'Sync failed';
    console.error('[calendar] sync failed for', userId, err);
    await db.update(calendarConnections).set({ lastError: msg.slice(0, 300) }).where(eq(calendarConnections.id, conn.id)).catch(() => undefined);
    return { upserted, removed, error: msg };
  }
}

/** After a booking or staffing change: bring every connected calendar in the company up to date. Never throws. */
export async function syncTenantCalendars(tenantId: string) {
  try {
    if (!calendarConfigured()) return;
    const conns = await db.select({ userId: calendarConnections.userId }).from(calendarConnections).where(eq(calendarConnections.tenantId, tenantId));
    for (const c of conns) await syncUserCalendar(c.userId);
  } catch (err) {
    console.error('[calendar] tenant sync failed', err);
  }
}

/** Daily: every connection everywhere (catches anything an edit path missed). */
export async function syncAllCalendars() {
  if (!calendarConfigured()) return { users: 0 };
  const conns = await db.select({ userId: calendarConnections.userId }).from(calendarConnections);
  for (const c of conns) await syncUserCalendar(c.userId);
  return { users: conns.length };
}

/** Removes upcoming events this app added, revokes access, and forgets the connection. */
export async function disconnectCalendar(user: { id: string; tenantId: string; name?: string | null }) {
  const [conn] = await db.select().from(calendarConnections).where(eq(calendarConnections.userId, user.id)).limit(1);
  if (!conn) return;
  try {
    const token = await accessToken(conn);
    const links = await db.select().from(calendarEventLinks).where(eq(calendarEventLinks.userId, user.id));
    const linked = links.length ? await db.select().from(bookings).where(inArray(bookings.id, links.map((l) => l.bookingId))) : [];
    const today = businessTodayISO();
    for (const l of links) {
      const b = linked.find((x) => x.id === l.bookingId);
      if (b && b.slotStart.slice(0, 10) >= today) await removeEvent(token, conn.calendarId, l.eventId).catch(() => undefined);
    }
    const refresh = unseal(conn.refreshToken);
    if (refresh) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refresh)}`, { method: 'POST' }).catch(() => undefined);
  } catch (err) {
    console.error('[calendar] cleanup on disconnect failed', err);
  }
  await db.delete(calendarEventLinks).where(eq(calendarEventLinks.userId, user.id));
  await db.delete(calendarConnections).where(eq(calendarConnections.id, conn.id));
  await logChange({ tenantId: user.tenantId, actor: { id: user.id, name: user.name }, entityType: 'integration', entityId: user.id, action: 'calendar_disconnected', summary: 'Disconnected Google Calendar' });
}
