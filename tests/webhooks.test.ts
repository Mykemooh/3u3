import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { db, seeded } from './helpers/fixtures';
import { apiKeys, bookings, tenants, webhookDeliveries, webhookEndpoints } from '@/db/schema';
import { createApiKey, revokeApiKey, authenticateApiKey, listApiKeys } from '@/lib/apiKeys';
import {
  createEndpoint, validateEndpointUrl, emitEvent, processDueDeliveries, verifySignature, rotateEndpointSecret,
  retryDelivery, MAX_ATTEMPTS, WebhookError,
} from '@/lib/webhooks';
import { bookingEvent } from '@/lib/events';
import { sha256, unseal } from '@/lib/secretBox';
import { eq } from 'drizzle-orm';

const realFetch = globalThis.fetch;
type Sent = { url: string; headers: Record<string, string>; body: string };
let sent: Sent[] = [];

function mockFetch(status: number | (() => never)) {
  sent = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    sent.push({ url: String(url), headers: init.headers as Record<string, string>, body: String(init.body) });
    if (typeof status === 'function') status();
    return new Response(status === 204 ? null : 'ok', { status: status as number });
  }) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

// A public IP literal, so no DNS lookup is needed in the sandbox.
const HOOK = 'https://93.184.216.34/hooks/trashcan';

async function otherTenant() {
  const id = crypto.randomUUID();
  await db.insert(tenants).values({ id, name: 'Other Co', slug: `other-${id.slice(0, 8)}` });
  return id;
}

test('API keys: shown once, stored hashed, revocable, scoped to the company', async () => {
  const { tenant, admin } = await seeded();
  const { id, key } = await createApiKey(tenant.id, 'Zapier', { id: admin.id, name: admin.name });
  assert.match(key, /^tc_live_/);
  const [row] = await db.select().from(apiKeys).where(eq(apiKeys.id, id));
  assert.equal(row.keyHash, sha256(key));
  assert.ok(!JSON.stringify(row).includes(key), 'the raw key is never stored');
  assert.ok(!JSON.stringify(await listApiKeys(tenant.id)).includes(row.keyHash), 'the hash is never listed');

  const req = (h: Record<string, string>) => new Request('https://x.test/api/hooks/leads', { method: 'POST', headers: h });
  assert.deepEqual(await authenticateApiKey(req({ authorization: `Bearer ${key}` })), { tenantId: tenant.id, keyId: id });
  assert.equal((await authenticateApiKey(req({ 'x-api-key': key })))?.tenantId, tenant.id);
  assert.equal(await authenticateApiKey(req({ authorization: `Bearer ${key}x` })), null);

  const other = await otherTenant();
  await assert.rejects(revokeApiKey(other, id, null), /Not found/, 'another company cannot revoke it');
  await revokeApiKey(tenant.id, id, { id: admin.id, name: admin.name });
  assert.equal(await authenticateApiKey(req({ authorization: `Bearer ${key}` })), null);
});

test('webhook addresses must be public https', () => {
  assert.throws(() => validateEndpointUrl('http://example.com/x'), WebhookError);
  assert.throws(() => validateEndpointUrl('https://localhost/x'), WebhookError);
  assert.throws(() => validateEndpointUrl('https://10.0.0.5/x'), WebhookError);
  assert.throws(() => validateEndpointUrl('https://169.254.169.254/latest'), WebhookError);
  assert.throws(() => validateEndpointUrl('https://[::1]/x'), WebhookError);
  assert.equal(validateEndpointUrl('https://hooks.zapier.com/a/b'), 'https://hooks.zapier.com/a/b');
});

test('events are signed, delivered only to subscribed endpoints of the same company', async () => {
  const { tenant, admin, client, standard, crew } = await seeded();
  const actor = { id: admin.id, name: admin.name };
  const all = await createEndpoint(tenant.id, { url: HOOK, events: ['*'] }, actor);
  const paidOnly = await createEndpoint(tenant.id, { url: `${HOOK}/paid`, events: ['invoice.paid'] }, actor);
  const other = await otherTenant();
  await createEndpoint(other, { url: `${HOOK}/other`, events: ['*'] }, null);

  const [stored] = await db.select().from(webhookEndpoints).where(eq(webhookEndpoints.id, all.id));
  assert.equal(unseal(stored.secret), all.secret, 'secret is recoverable for signing');
  assert.notEqual(stored.secret, all.secret, 'secret is encrypted at rest when the key is set');

  const bookingId = crypto.randomUUID();
  await db.insert(bookings).values({ id: bookingId, tenantId: tenant.id, clientId: client.id, serviceTypeId: standard.id, crewId: crew.id, slotStart: '2030-01-02T09:00:00', slotEnd: '2030-01-02T11:30:00' });

  mockFetch(200);
  await bookingEvent('booking.created', bookingId);
  assert.equal(sent.length, 1, 'only the catch-all endpoint of this company');
  const msg = sent[0];
  assert.equal(msg.url, HOOK);
  assert.equal(msg.headers['TrashCan-Event'], 'booking.created');
  assert.ok(verifySignature(all.secret, msg.body, msg.headers['TrashCan-Signature']));
  assert.ok(!verifySignature(paidOnly.secret, msg.body, msg.headers['TrashCan-Signature']));
  assert.ok(!verifySignature(all.secret, msg.body + ' ', msg.headers['TrashCan-Signature']), 'a changed body fails');
  const body = JSON.parse(msg.body);
  assert.equal(body.type, 'booking.created');
  assert.equal(body.data.booking.id, bookingId);
  assert.equal(body.data.booking.client.name, client.name);
  assert.ok(!('entryCodeEncrypted' in (body.data.booking.address ?? {})));

  const [delivery] = await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.endpointId, all.id));
  assert.equal(delivery.status, 'SUCCEEDED');
  assert.equal(delivery.lastStatusCode, 200);

  // A rotated secret signs from then on.
  const { secret: newSecret } = await rotateEndpointSecret(tenant.id, all.id, actor);
  mockFetch(200);
  await emitEvent(tenant.id, 'review.created', { review: { id: 'r1' } });
  assert.ok(verifySignature(newSecret, sent[0].body, sent[0].headers['TrashCan-Signature']));

  await db.delete(webhookEndpoints).where(eq(webhookEndpoints.tenantId, tenant.id));
});

test('failed deliveries retry with backoff, then give up; manual retry works', async () => {
  const { tenant } = await seeded();
  const ep = await createEndpoint(tenant.id, { url: HOOK, events: ['job.completed'] }, null);

  mockFetch(500);
  await emitEvent(tenant.id, 'job.completed', { job: { id: 'j1' } });
  let [d] = await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.endpointId, ep.id));
  assert.equal(d.status, 'PENDING');
  assert.equal(d.attempts, 1);
  assert.equal(d.lastStatusCode, 500);
  const wait = d.nextAttemptAt!.getTime() - Date.now();
  assert.ok(wait > 50_000 && wait < 70_000, 'first retry about a minute later');

  assert.equal(await processDueDeliveries({ tenantId: tenant.id }), 0, 'not due yet');

  for (let i = 2; i <= MAX_ATTEMPTS; i++) {
    await db.update(webhookDeliveries).set({ nextAttemptAt: new Date(Date.now() - 1000) }).where(eq(webhookDeliveries.id, d.id));
    mockFetch(() => {
      throw new Error('connection refused');
    });
    assert.equal(await processDueDeliveries({ tenantId: tenant.id }), 1);
    [d] = await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.id, d.id));
    assert.equal(d.attempts, i);
  }
  assert.equal(d.status, 'FAILED');
  assert.equal(d.nextAttemptAt, null);
  assert.match(d.lastError!, /connection refused/);

  mockFetch(204);
  const retried = await retryDelivery(tenant.id, d.id);
  assert.equal(retried!.status, 'SUCCEEDED');

  const other = await otherTenant();
  await assert.rejects(retryDelivery(other, d.id), /Not found/);
  await db.delete(webhookEndpoints).where(eq(webhookEndpoints.id, ep.id));
});

test('no endpoints, no work: events for a company without webhooks send nothing', async () => {
  const { tenant } = await seeded();
  mockFetch(200);
  await emitEvent(tenant.id, 'lead.created', { lead: {} });
  assert.equal(sent.length, 0);
});
