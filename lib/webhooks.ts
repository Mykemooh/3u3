import { createHmac, timingSafeEqual } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { webhookDeliveries, webhookEndpoints } from '@/db/schema';
import { logChange, type Actor } from '@/lib/audit';
import { randomToken, seal, unseal } from '@/lib/secretBox';

/**
 * Outgoing webhooks: when something happens in a company's account, every
 * endpoint it has subscribed gets a signed JSON POST.
 *
 *   POST <endpoint url>
 *   Content-Type: application/json
 *   TrashCan-Event: booking.created
 *   TrashCan-Delivery: <delivery id>
 *   TrashCan-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<body>")>
 *
 *   { "id": "evt_…", "type": "booking.created", "created_at": "…", "data": { … } }
 *
 * Any 2xx counts as delivered. Anything else (or no answer within
 * DELIVERY_TIMEOUT_MS) is retried on the RETRY_DELAYS schedule, then
 * marked failed. Every attempt is recorded in webhook_deliveries, which
 * Admin → Settings → API and webhooks shows as the delivery log.
 *
 * Retries run whenever a new event is sent for the company and on the
 * daily jobs (app/api/cron/*); /api/cron/webhooks can be called more often
 * by any scheduler that sends the CRON_SECRET.
 *
 * emitEvent() never throws: a webhook is never a reason for a booking,
 * payment or job update to fail.
 */

export const WEBHOOK_EVENTS = [
  { type: 'lead.created', label: 'New lead', detail: 'A walkthrough request from your site, or a lead sent in by API.' },
  { type: 'booking.created', label: 'Cleaning booked', detail: 'A client or the office booked a cleaning.' },
  { type: 'booking.cancelled', label: 'Cleaning cancelled', detail: 'A booked cleaning was cancelled or skipped.' },
  { type: 'job.started', label: 'Job started', detail: 'The crew tapped Start at the home.' },
  { type: 'job.completed', label: 'Job finished', detail: 'The crew finished the job.' },
  { type: 'invoice.sent', label: 'Invoice sent', detail: 'An invoice went to the client.' },
  { type: 'invoice.paid', label: 'Invoice paid', detail: 'A client paid an invoice.' },
  { type: 'review.created', label: 'Review left', detail: 'A client rated a cleaning.' },
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENTS)[number]['type'];
const EVENT_TYPES = new Set<string>(WEBHOOK_EVENTS.map((e) => e.type));

export const RETRY_DELAYS_SECONDS = [60, 5 * 60, 30 * 60, 2 * 3600, 12 * 3600];
export const MAX_ATTEMPTS = RETRY_DELAYS_SECONDS.length + 1;
export const DELIVERY_TIMEOUT_MS = 5000;
export const MAX_ENDPOINTS = 10;

export class WebhookError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

// ---- Signing --------------------------------------------------------------

export function signPayload(secret: string, body: string, timestamp = Math.floor(Date.now() / 1000)) {
  const v1 = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return `t=${timestamp},v1=${v1}`;
}

/** For receivers (and our tests): checks a TrashCan-Signature header, rejecting anything older than toleranceSeconds. */
export function verifySignature(secret: string, body: string, header: string, toleranceSeconds = 300): boolean {
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]));
  const t = Number(parts.t);
  if (!t || !parts.v1 || Math.abs(Date.now() / 1000 - t) > toleranceSeconds) return false;
  const expected = Buffer.from(createHmac('sha256', secret).update(`${t}.${body}`).digest('hex'));
  const given = Buffer.from(parts.v1);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

// ---- Where we're allowed to send -------------------------------------------

function privateAddress(ip: string): boolean {
  if (ip.includes(':')) {
    const v = ip.toLowerCase();
    if (v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80')) return true;
    const mapped = v.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return mapped ? privateAddress(mapped[1]) : false;
  }
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
  );
}

/** Endpoints must be public https URLs — never this server's own network. */
export function validateEndpointUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new WebhookError('Enter the full address, starting with https://');
  }
  if (url.protocol !== 'https:') throw new WebhookError('Webhook addresses must start with https://');
  if (url.username || url.password) throw new WebhookError('Leave the username and password out of the address.');
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new WebhookError('That address is on a private network.');
  }
  if (isIP(host) && privateAddress(host)) throw new WebhookError('That address is on a private network.');
  if (url.toString().length > 500) throw new WebhookError('That address is too long.');
  return url.toString();
}

async function resolvesPublic(urlString: string): Promise<boolean> {
  const host = new URL(urlString).hostname.replace(/^\[|\]$/g, '');
  if (isIP(host)) return !privateAddress(host);
  try {
    const addrs = await lookup(host, { all: true });
    return addrs.length > 0 && addrs.every((a) => !privateAddress(a.address));
  } catch {
    return false;
  }
}

// ---- Endpoints --------------------------------------------------------------

function parseEvents(events: string[] | undefined): string {
  if (!events || events.length === 0 || events.includes('*')) return '*';
  const bad = events.filter((e) => !EVENT_TYPES.has(e));
  if (bad.length) throw new WebhookError(`Unknown event: ${bad.join(', ')}`);
  return Array.from(new Set(events)).sort().join(',');
}

export const subscribes = (events: string, type: string) => events === '*' || events.split(',').includes(type);

export async function createEndpoint(
  tenantId: string,
  input: { url: string; description?: string | null; events?: string[] },
  actor: Actor,
) {
  const url = validateEndpointUrl(input.url);
  const count = await db.select({ id: webhookEndpoints.id }).from(webhookEndpoints).where(eq(webhookEndpoints.tenantId, tenantId));
  if (count.length >= MAX_ENDPOINTS) throw new WebhookError(`A company can have ${MAX_ENDPOINTS} webhook addresses.`);
  const secret = randomToken('whsec_', 24);
  const id = crypto.randomUUID();
  await db.insert(webhookEndpoints).values({
    id,
    tenantId,
    url,
    description: input.description?.trim().slice(0, 120) || null,
    events: parseEvents(input.events),
    secret: seal(secret),
    createdByUserId: actor?.id ?? null,
  });
  await logChange({ tenantId, actor, entityType: 'webhook', entityId: id, action: 'created', summary: `Added webhook ${url}` });
  return { id, secret };
}

async function ownEndpoint(tenantId: string, id: string) {
  const [row] = await db.select().from(webhookEndpoints).where(and(eq(webhookEndpoints.id, id), eq(webhookEndpoints.tenantId, tenantId))).limit(1);
  if (!row) throw new WebhookError('Not found', 404);
  return row;
}

export async function updateEndpoint(
  tenantId: string,
  id: string,
  input: { url?: string; description?: string | null; events?: string[]; active?: boolean },
  actor: Actor,
) {
  const before = await ownEndpoint(tenantId, id);
  const next: Partial<typeof webhookEndpoints.$inferInsert> = { updatedAt: new Date() };
  if (input.url !== undefined) next.url = validateEndpointUrl(input.url);
  if (input.description !== undefined) next.description = input.description?.trim().slice(0, 120) || null;
  if (input.events !== undefined) next.events = parseEvents(input.events);
  if (input.active !== undefined) next.active = input.active;
  await db.update(webhookEndpoints).set(next).where(eq(webhookEndpoints.id, id));
  const changes = (['url', 'description', 'events', 'active'] as const)
    .filter((k) => next[k] !== undefined && next[k] !== before[k])
    .map((k) => ({ field: k, from: before[k], to: next[k] }));
  if (changes.length) {
    await logChange({ tenantId, actor, entityType: 'webhook', entityId: id, action: 'updated', summary: `Changed webhook ${next.url ?? before.url}`, changes });
  }
}

export async function rotateEndpointSecret(tenantId: string, id: string, actor: Actor) {
  const row = await ownEndpoint(tenantId, id);
  const secret = randomToken('whsec_', 24);
  await db.update(webhookEndpoints).set({ secret: seal(secret), updatedAt: new Date() }).where(eq(webhookEndpoints.id, id));
  await logChange({ tenantId, actor, entityType: 'webhook', entityId: id, action: 'secret_rotated', summary: `New signing secret for ${row.url}` });
  return { secret };
}

export async function deleteEndpoint(tenantId: string, id: string, actor: Actor) {
  const row = await ownEndpoint(tenantId, id);
  await db.delete(webhookEndpoints).where(eq(webhookEndpoints.id, id));
  await logChange({ tenantId, actor, entityType: 'webhook', entityId: id, action: 'deleted', summary: `Removed webhook ${row.url}` });
}

export async function listEndpoints(tenantId: string) {
  const rows = await db.select().from(webhookEndpoints).where(eq(webhookEndpoints.tenantId, tenantId)).orderBy(webhookEndpoints.createdAt);
  return rows.map(({ secret: _s, ...rest }) => rest);
}

export async function listDeliveries(tenantId: string, limit = 50) {
  return db
    .select({
      id: webhookDeliveries.id,
      endpointId: webhookDeliveries.endpointId,
      eventType: webhookDeliveries.eventType,
      eventId: webhookDeliveries.eventId,
      status: webhookDeliveries.status,
      attempts: webhookDeliveries.attempts,
      nextAttemptAt: webhookDeliveries.nextAttemptAt,
      lastStatusCode: webhookDeliveries.lastStatusCode,
      lastError: webhookDeliveries.lastError,
      deliveredAt: webhookDeliveries.deliveredAt,
      createdAt: webhookDeliveries.createdAt,
    })
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.tenantId, tenantId))
    .orderBy(desc(webhookDeliveries.createdAt))
    .limit(limit);
}

// ---- Sending ----------------------------------------------------------------

type Delivery = typeof webhookDeliveries.$inferSelect;

async function attempt(delivery: Delivery): Promise<void> {
  const [endpoint] = await db.select().from(webhookEndpoints).where(eq(webhookEndpoints.id, delivery.endpointId)).limit(1);
  const attempts = delivery.attempts + 1;
  const finish = (ok: boolean, code: number | null, error: string | null) => {
    const giveUp = !ok && attempts >= MAX_ATTEMPTS;
    return db
      .update(webhookDeliveries)
      .set({
        attempts,
        status: ok ? 'SUCCEEDED' : giveUp ? 'FAILED' : 'PENDING',
        lastStatusCode: code,
        lastError: error ? error.slice(0, 300) : null,
        deliveredAt: ok ? new Date() : null,
        nextAttemptAt: ok || giveUp ? null : new Date(Date.now() + RETRY_DELAYS_SECONDS[attempts - 1] * 1000),
      })
      .where(eq(webhookDeliveries.id, delivery.id));
  };

  if (!endpoint || !endpoint.active) return void (await finish(false, null, 'Webhook turned off or removed'));
  const secret = unseal(endpoint.secret);
  if (!secret) return void (await finish(false, null, 'Signing secret unreadable — rotate the secret'));
  if (!(await resolvesPublic(endpoint.url))) return void (await finish(false, null, 'Address did not resolve to a public server'));

  try {
    const res = await fetch(endpoint.url, {
      method: 'POST',
      redirect: 'manual',
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'TrashCan-Webhooks/1',
        'TrashCan-Event': delivery.eventType,
        'TrashCan-Delivery': delivery.id,
        'TrashCan-Signature': signPayload(secret, delivery.payload),
      },
      body: delivery.payload,
    });
    const ok = res.status >= 200 && res.status < 300;
    await finish(ok, res.status, ok ? null : `HTTP ${res.status}`);
  } catch (err) {
    const msg = err instanceof Error ? (err.name === 'TimeoutError' ? `No answer within ${DELIVERY_TIMEOUT_MS / 1000}s` : err.message) : 'Request failed';
    await finish(false, null, msg);
  }
}

/**
 * Claims due deliveries (so two sweeps running at once never send the
 * same one twice) and attempts them. Returns how many were attempted.
 */
export async function processDueDeliveries(opts: { tenantId?: string; limit?: number } = {}): Promise<number> {
  const limit = opts.limit ?? 50;
  const tenantFilter = opts.tenantId ? sql`AND tenant_id = ${opts.tenantId}` : sql``;
  const claimed = await db.execute<{ id: string }>(sql`
    UPDATE webhook_deliveries SET next_attempt_at = now() + interval '2 minutes'
    WHERE id IN (
      SELECT id FROM webhook_deliveries
      WHERE status = 'PENDING' AND next_attempt_at <= now() ${tenantFilter}
      ORDER BY next_attempt_at
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id`);
  const ids = claimed.rows.map((r) => r.id);
  if (!ids.length) return 0;
  const rows = await db.select().from(webhookDeliveries).where(inArray(webhookDeliveries.id, ids));
  await Promise.allSettled(rows.map(attempt));
  return rows.length;
}

/** Cheap check before building a payload nobody is listening for. */
export async function hasSubscriber(tenantId: string, type: string): Promise<boolean> {
  const rows = await db
    .select({ events: webhookEndpoints.events })
    .from(webhookEndpoints)
    .where(and(eq(webhookEndpoints.tenantId, tenantId), eq(webhookEndpoints.active, true)));
  return rows.some((r) => subscribes(r.events, type));
}

/** Queues one delivery per subscribed endpoint and sends them now. Never throws. */
export async function emitEvent(
  tenantId: string,
  type: WebhookEventType,
  data: Record<string, unknown>,
  opts: { sendNow?: boolean } = {},
): Promise<void> {
  try {
    const endpoints = (
      await db.select().from(webhookEndpoints).where(and(eq(webhookEndpoints.tenantId, tenantId), eq(webhookEndpoints.active, true)))
    ).filter((e) => subscribes(e.events, type));
    if (!endpoints.length) return;
    const event = { id: `evt_${crypto.randomUUID().replace(/-/g, '')}`, type, created_at: new Date().toISOString(), data };
    const payload = JSON.stringify(event);
    await db.insert(webhookDeliveries).values(
      endpoints.map((e) => ({ id: crypto.randomUUID(), tenantId, endpointId: e.id, eventId: event.id, eventType: type, payload, nextAttemptAt: new Date() })),
    );
    // Sends these, plus anything else of this company's that's come due.
    // Bulk callers (a recurring series made 20 visits) queue with
    // sendNow false and sweep once at the end instead.
    if (opts.sendNow !== false) await processDueDeliveries({ tenantId, limit: endpoints.length + 10 });
  } catch (err) {
    console.error('[webhooks] could not send', type, err);
  }
}

/** "Send test event" on an endpoint — goes through the same queue and log. */
export async function sendTestEvent(tenantId: string, endpointId: string) {
  const endpoint = await ownEndpoint(tenantId, endpointId);
  const event = { id: `evt_${crypto.randomUUID().replace(/-/g, '')}`, type: 'test', created_at: new Date().toISOString(), data: { message: 'Test event from TrashCan' } };
  const id = crypto.randomUUID();
  await db.insert(webhookDeliveries).values({ id, tenantId, endpointId: endpoint.id, eventId: event.id, eventType: 'test', payload: JSON.stringify(event), nextAttemptAt: new Date() });
  await attempt((await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.id, id)).limit(1))[0]);
  return (await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.id, id)).limit(1))[0];
}

/** "Retry now" from the delivery log — failed or still-waiting deliveries only. */
export async function retryDelivery(tenantId: string, deliveryId: string) {
  const [row] = await db
    .select()
    .from(webhookDeliveries)
    .where(and(eq(webhookDeliveries.id, deliveryId), eq(webhookDeliveries.tenantId, tenantId)))
    .limit(1);
  if (!row) throw new WebhookError('Not found', 404);
  if (row.status === 'SUCCEEDED') throw new WebhookError('That one was already delivered.');
  // A manual retry gets the full set of attempts again.
  await db.update(webhookDeliveries).set({ status: 'PENDING', attempts: 0, nextAttemptAt: new Date() }).where(eq(webhookDeliveries.id, row.id));
  await attempt({ ...row, status: 'PENDING', attempts: 0 });
  return (await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.id, row.id)).limit(1))[0];
}
