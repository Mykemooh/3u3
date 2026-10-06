import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { db, seeded, makeUser } from './helpers/fixtures';
import { backgroundChecks, tenants } from '@/db/schema';
import { startBackgroundCheck, handleCheckrEvent, verifyCheckrSignature, statusFromEvent, CheckrError } from '@/lib/checkr';
import { POST as hook } from '@/app/api/hooks/checkr/route';
import { eq } from 'drizzle-orm';

const realFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = realFetch;
  delete process.env.CHECKR_API_KEY;
});

test('sending a check creates a Checkr candidate and invitation; one open check at a time', async () => {
  const { tenant, admin } = await seeded();
  await assert.rejects(startBackgroundCheck(tenant.id, admin.id, { state: 'TX' }, null), /aren’t set up/);
  process.env.CHECKR_API_KEY = 'ck_test_123';
  const person = await makeUser(tenant.id, 'CLEANER', { name: 'Casey Ann Cleaner' });
  const calls: { url: string; body: any; auth: string }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    calls.push({ url: String(url), body, auth: (init.headers as Record<string, string>).Authorization });
    return Response.json(String(url).endsWith('/candidates') ? { id: 'cand_1' } : { id: 'inv_1', invitation_url: 'https://apply.checkr.com/x' });
  }) as typeof fetch;

  await assert.rejects(startBackgroundCheck(tenant.id, person.id, { state: 'Texas' }, null), CheckrError);
  await startBackgroundCheck(tenant.id, person.id, { state: 'tx', city: 'Katy' }, { id: admin.id, name: admin.name });
  assert.equal(calls[0].url, 'https://api.checkr.com/v1/candidates');
  assert.equal(calls[0].auth, `Basic ${Buffer.from('ck_test_123:').toString('base64')}`);
  assert.equal(calls[0].body.first_name, 'Casey');
  assert.equal(calls[0].body.last_name, 'Ann Cleaner');
  assert.equal(calls[1].body.candidate_id, 'cand_1');
  assert.equal(calls[1].body.package, 'basic_plus');
  const [row] = await db.select().from(backgroundChecks).where(eq(backgroundChecks.userId, person.id));
  assert.equal(row.status, 'INVITED');
  assert.equal(row.workState, 'TX');
  await assert.rejects(startBackgroundCheck(tenant.id, person.id, { state: 'TX' }, null), /already under way/);

  const otherId = crypto.randomUUID();
  await db.insert(tenants).values({ id: otherId, name: 'Other', slug: `ck-${otherId.slice(0, 8)}` });
  await assert.rejects(startBackgroundCheck(otherId, person.id, { state: 'TX' }, null), /not found/);
});

test('webhooks: signature required; status follows the report', async () => {
  process.env.CHECKR_API_KEY = 'ck_test_123';
  const send = (event: object, sign = true) => {
    const raw = JSON.stringify(event);
    const sig = createHmac('sha256', sign ? 'ck_test_123' : 'wrong').update(raw).digest('hex');
    return hook(new Request('http://localhost/api/hooks/checkr', { method: 'POST', body: raw, headers: { 'x-checkr-signature': sig } }));
  };
  assert.equal((await send({ type: 'report.completed' }, false)).status, 401);
  assert.equal(verifyCheckrSignature('{}', null), false);

  await send({ type: 'invitation.completed', data: { object: { candidate_id: 'cand_1' } } });
  let [row] = await db.select().from(backgroundChecks).where(eq(backgroundChecks.candidateId, 'cand_1'));
  assert.equal(row.status, 'PENDING');

  await send({ type: 'report.completed', data: { object: { id: 'rep_1', candidate_id: 'cand_1', result: 'clear' } } });
  [row] = await db.select().from(backgroundChecks).where(eq(backgroundChecks.candidateId, 'cand_1'));
  assert.equal(row.status, 'CLEAR');
  assert.equal(row.reportId, 'rep_1');
  assert.ok(row.completedAt);

  // A late, out-of-order event doesn't undo a finished check.
  await handleCheckrEvent({ type: 'report.created', data: { object: { id: 'rep_1', candidate_id: 'cand_1' } } });
  [row] = await db.select().from(backgroundChecks).where(eq(backgroundChecks.candidateId, 'cand_1'));
  assert.equal(row.status, 'CLEAR');

  assert.equal(statusFromEvent({ type: 'report.completed', data: { object: { assessment: 'review' } } })?.status, 'CONSIDER');
  assert.equal(statusFromEvent({ type: 'report.completed', data: { object: { assessment: 'eligible' } } })?.status, 'CLEAR');
  assert.equal(statusFromEvent({ type: 'candidate.created' }), null);
});
