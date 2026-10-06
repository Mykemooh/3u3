import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { db, seeded } from './helpers/fixtures';
import { bookings, jobs, calendarConnections, calendarEventLinks } from '@/db/schema';
import { syncUserCalendar, eventIdFor, desiredEvents, disconnectCalendar } from '@/lib/googleCalendar';
import { seal } from '@/lib/secretBox';
import { businessTodayISO } from '@/lib/time';
import { eq } from 'drizzle-orm';

const realFetch = globalThis.fetch;
type Call = { method: string; url: string; body: any };
let calls: Call[] = [];
let existing = new Set<string>();

before(() => {
  process.env.GOOGLE_CLIENT_ID = 'test-client';
  process.env.GOOGLE_CLIENT_SECRET = 'test-secret';
  globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    const body = init.body ? JSON.parse(String(init.body)) : null;
    calls.push({ method, url: String(url), body });
    const id = String(url).split('/events/')[1];
    if (method === 'PUT') return new Response(existing.has(id) ? '{}' : '{"error":"notFound"}', { status: existing.has(id) ? 200 : 404 });
    if (method === 'POST' && String(url).endsWith('/events')) {
      existing.add(body.id);
      return new Response('{}', { status: 200 });
    }
    if (method === 'DELETE') {
      existing.delete(id);
      return new Response(null, { status: 204 });
    }
    return new Response('{}', { status: 200 });
  }) as typeof fetch;
});

after(() => {
  globalThis.fetch = realFetch;
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
});

const inDays = (n: number) => {
  const d = new Date(`${businessTodayISO()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

test('a crew member’s jobs are pushed once, updated when moved, removed when cancelled', async () => {
  const { tenant, lead, client, crew, standard, address } = await seeded();
  await db.insert(calendarConnections).values({
    id: crypto.randomUUID(), tenantId: tenant.id, userId: lead.id, refreshToken: seal('refresh'), accessToken: seal('access'), expiresAt: new Date(Date.now() + 3600_000),
  });

  const bookingId = crypto.randomUUID();
  const day = inDays(5);
  await db.insert(bookings).values({ id: bookingId, tenantId: tenant.id, clientId: client.id, serviceTypeId: standard.id, crewId: crew.id, addressId: address.id, slotStart: `${day}T09:00:00`, slotEnd: `${day}T11:30:00` });
  await db.insert(jobs).values({ id: crypto.randomUUID(), bookingId, crewId: crew.id });
  const far = crypto.randomUUID();
  await db.insert(bookings).values({ id: far, tenantId: tenant.id, clientId: client.id, serviceTypeId: standard.id, crewId: crew.id, slotStart: `${inDays(200)}T09:00:00`, slotEnd: `${inDays(200)}T11:00:00` });
  await db.insert(jobs).values({ id: crypto.randomUUID(), bookingId: far, crewId: crew.id });

  const eid = eventIdFor(bookingId);
  assert.match(eid, /^[a-v0-9]{5,1024}$/, 'a valid Google event id');

  calls = [];
  let r = await syncUserCalendar(lead.id);
  assert.equal(r.error, undefined);
  const mine = calls.filter((c) => c.url.includes(eid) || c.body?.id === eid);
  assert.deepEqual(mine.map((c) => c.method), ['PUT', 'POST'], 'tries an update, then creates with our id');
  const sentEvent = mine[1].body;
  assert.equal(sentEvent.id, eid);
  assert.match(sentEvent.summary, new RegExp(client.name));
  assert.equal(sentEvent.start.dateTime, `${day}T09:00:00`);
  assert.ok(!JSON.stringify(sentEvent).toLowerCase().includes('entry'), 'no entry codes');
  assert.ok(!calls.some((c) => c.url.includes(eventIdFor(far))), 'beyond the sync window');

  calls = [];
  r = await syncUserCalendar(lead.id);
  assert.equal(calls.filter((c) => c.url.includes(eid)).length, 0, 'unchanged: no calls');

  await db.update(bookings).set({ slotStart: `${day}T13:00:00`, slotEnd: `${day}T15:30:00` }).where(eq(bookings.id, bookingId));
  calls = [];
  await syncUserCalendar(lead.id);
  const moved = calls.filter((c) => c.url.includes(eid));
  assert.deepEqual(moved.map((c) => c.method), ['PUT']);
  assert.equal(moved[0].body.start.dateTime, `${day}T13:00:00`);

  await db.update(bookings).set({ status: 'CANCELLED' }).where(eq(bookings.id, bookingId));
  calls = [];
  await syncUserCalendar(lead.id);
  assert.deepEqual(calls.filter((c) => c.url.includes(eid)).map((c) => c.method), ['DELETE']);
  assert.equal((await db.select().from(calendarEventLinks).where(eq(calendarEventLinks.bookingId, bookingId))).length, 0);

  await disconnectCalendar({ id: lead.id, tenantId: tenant.id });
  assert.equal((await db.select().from(calendarConnections).where(eq(calendarConnections.userId, lead.id))).length, 0);
});

test('only the person’s own company and assignments are included', async () => {
  const { lead, admin } = await seeded();
  const events = await desiredEvents(lead.id);
  const leadBookings = await db.select().from(bookings).where(eq(bookings.tenantId, admin.tenantId));
  for (const e of events) assert.ok(leadBookings.some((b) => b.id === e.bookingId));
});

test('a revoked Google grant is recorded, not thrown', async () => {
  const { tenant, admin } = await seeded();
  await db.insert(calendarConnections).values({ id: crypto.randomUUID(), tenantId: tenant.id, userId: admin.id, refreshToken: seal('gone'), accessToken: null, expiresAt: null });
  const saved = globalThis.fetch;
  globalThis.fetch = (async () => new Response('{"error":"invalid_grant"}', { status: 400 })) as typeof fetch;
  const r = await syncUserCalendar(admin.id);
  globalThis.fetch = saved;
  assert.match(r.error!, /Connect Google Calendar again/);
  const [row] = await db.select().from(calendarConnections).where(eq(calendarConnections.userId, admin.id));
  assert.match(row.lastError!, /again/);
  await db.delete(calendarConnections).where(eq(calendarConnections.userId, admin.id));
});
