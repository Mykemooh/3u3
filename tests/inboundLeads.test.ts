import { test } from 'node:test';
import assert from 'node:assert/strict';
import { db, seeded } from './helpers/fixtures';
import { inboundLeads, tenants } from '@/db/schema';
import { parseLead, receiveLead, setInboundLeadStatus, listInboundLeads, InboundLeadError, phoneKey } from '@/lib/inboundLeads';
import { createApiKey } from '@/lib/apiKeys';
import { POST } from '@/app/api/hooks/leads/route';
import { eq } from 'drizzle-orm';

test('parses the field names different lead sources use', () => {
  const a = parseLead({ first_name: 'Jamie', last_name: 'Lee', phone_number: '(281) 555-0123', city: 'Katy', state: 'TX', street: '1 Main St', notes: 'Move-out', lead_source: 'Thumbtack' });
  assert.equal(a.name, 'Jamie Lee');
  assert.equal(a.address, '1 Main St, Katy TX');
  assert.equal(a.message, 'Move-out');
  assert.equal(a.source, 'Thumbtack');
  assert.equal(phoneKey('+1 281 555 0123'), phoneKey('281-555-0123'));
  assert.throws(() => parseLead({ phone: '2815550123' }), /needs a name/);
  assert.throws(() => parseLead({ name: 'X', email: 'not-an-email' }), /phone number or an email/);
});

test('a repeat from the same phone or email joins the open lead; other companies are separate', async () => {
  const { tenant } = await seeded();
  const first = await receiveLead(tenant.id, { name: 'Dee Dupe', phone: '713-555-0144', message: 'Deep clean', source: 'Angi' }, null);
  assert.equal(first.duplicate, false);
  const again = await receiveLead(tenant.id, { name: 'Dee D.', phone: '+1 (713) 555-0144', email: 'dee@example.com', message: 'Still interested', source: 'Facebook' }, null);
  assert.deepEqual(again, { id: first.id, duplicate: true });
  const [row] = await db.select().from(inboundLeads).where(eq(inboundLeads.id, first.id));
  assert.equal(row.duplicateCount, 1);
  assert.equal(row.email, 'dee@example.com', 'blank filled from the repeat');
  assert.match(row.message!, /Deep clean[\s\S]*Facebook: Still interested/);

  const byEmail = await receiveLead(tenant.id, { name: 'Dee', email: 'DEE@example.com' }, null);
  assert.equal(byEmail.id, first.id);

  const otherId = crypto.randomUUID();
  await db.insert(tenants).values({ id: otherId, name: 'Other', slug: `o-${otherId.slice(0, 8)}` });
  const other = await receiveLead(otherId, { name: 'Dee', phone: '713-555-0144' }, null);
  assert.notEqual(other.id, first.id);
  assert.equal((await listInboundLeads(otherId)).length, 1);

  // Once dismissed, the next one is a new lead.
  await setInboundLeadStatus(tenant.id, first.id, 'DISMISSED', null);
  const fresh = await receiveLead(tenant.id, { name: 'Dee', phone: '7135550144' }, null);
  assert.notEqual(fresh.id, first.id);
  await assert.rejects(setInboundLeadStatus(otherId, fresh.id, 'CONTACTED', null), InboundLeadError);
});

test('POST /api/hooks/leads needs a valid key and creates the lead in that key’s company', async () => {
  const { tenant, admin, client } = await seeded();
  const { key } = await createApiKey(tenant.id, 'Zapier', { id: admin.id, name: admin.name });
  const post = (body: string, headers: Record<string, string>) => POST(new Request('http://localhost/api/hooks/leads', { method: 'POST', body, headers }));

  assert.equal((await post('{"name":"A","phone":"2815550100"}', { 'content-type': 'application/json' })).status, 401);
  assert.equal((await post('{"name":"A"', { authorization: `Bearer ${key}`, 'content-type': 'application/json' })).status, 400);
  assert.equal((await post('{"name":"A"}', { authorization: `Bearer ${key}`, 'content-type': 'application/json' })).status, 400);

  const res = await post('name=Form+Lead&email=form%40example.com&message=Hi', { 'x-api-key': key, 'content-type': 'application/x-www-form-urlencoded' });
  assert.equal(res.status, 201);
  const { id } = await res.json();
  const [row] = await db.select().from(inboundLeads).where(eq(inboundLeads.id, id));
  assert.equal(row.tenantId, tenant.id);
  assert.equal(row.email, 'form@example.com');

  // An existing client is recognised by phone.
  const res2 = await post(JSON.stringify({ name: client.name, phone: client.phone }), { authorization: `Bearer ${key}`, 'content-type': 'application/json' });
  const [row2] = await db.select().from(inboundLeads).where(eq(inboundLeads.id, (await res2.json()).id));
  assert.equal(row2.clientId, client.id);
});
