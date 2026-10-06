import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seeded, db } from './helpers/fixtures';
import { brainstorm, copyIssues, editConcept, getConcept, imageUrlFor, listConcepts, suggestPlan, toCampaign, MuseError, templateConcepts, companyFacts } from '@/lib/muse';
import { connectMeta, publishPaused, publishProblems, getMeta, MetaError } from '@/lib/meta';
import { campaigns, adConcepts, metaConnections } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { runTool, type TexContext } from '@/lib/texTools';

test('Muse copy rules: no prices, no puffery, no personal targeting, no made-up reviews', () => {
  const ok = { headline: 'Spring cleaning made easy', primaryText: 'Book a free walkthrough and we will walk your home and give you an exact quote.' };
  assert.deepEqual(copyIssues(ok), []);
  assert.ok(copyIssues({ ...ok, primaryText: 'Deep cleans from $99 this week only, 20% off!' }).some((i) => /price/i.test(i)));
  assert.ok(copyIssues({ ...ok, headline: 'The best in Katy, guaranteed' }).some((i) => /claim/i.test(i)));
  assert.ok(copyIssues({ ...ok, primaryText: 'Are you struggling to keep up with your house? We help with that, every week.' }).some((i) => /personal/i.test(i)));
  assert.ok(copyIssues({ ...ok, primaryText: '"Best cleaners ever, my house sparkles!" — Karen, plus 200 five-star reviews' }).some((i) => /testimonial/i.test(i)));
  assert.ok(copyIssues({ ...ok, headline: 'x'.repeat(70) }).some((i) => /60/.test(i)));
});

test('Muse drafts without an AI key, from the company’s own facts; images are free URLs', async () => {
  delete process.env.ANTHROPIC_API_KEY;
  const { tenant, admin } = await seeded();
  const facts = await companyFacts(tenant.id);
  for (const c of templateConcepts(facts, 'anything', 5)) assert.deepEqual(copyIssues(c), [], `template “${c.title}” breaks the rules`);
  const r = await brainstorm(tenant.id, { goal: 'win back lapsed clients', channel: 'EMAIL', count: 2 }, { id: admin.id, name: admin.name });
  assert.equal(r.usedModel, false);
  assert.equal(r.ids.length, 2);
  const list = await listConcepts(tenant.id);
  const first = list.find((c) => c.id === r.ids[0])!;
  assert.equal(first.segment, 'LAPSED');
  assert.match(first.imageUrl, /^https:\/\/image\.pollinations\.ai\/prompt\//);
  assert.notEqual(imageUrlFor('a kitchen', 1), imageUrlFor('a kitchen', 2));
  await assert.rejects(() => brainstorm(tenant.id, { goal: 'x' }), MuseError);
  const plan = await suggestPlan(tenant.id);
  assert.ok(plan.length >= 1 && plan.every((p) => p.week >= 1 && p.week <= 4));
});

test('Muse with a key: structured ideas are saved; rule-breaking copy can’t be approved', async () => {
  const { tenant } = await seeded();
  process.env.ANTHROPIC_API_KEY = 'test-key';
  const real = globalThis.fetch;
  let sent: { tool_choice?: { name: string } } = {};
  globalThis.fetch = (async (_u: unknown, init?: { body?: string }) => {
    sent = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't', name: 'submit_concepts', input: { concepts: [
      { title: 'Holiday hosting', angle: 'urgency', headline: 'Hosting this year? Start clean', primaryText: 'We handle the bathrooms, floors and kitchen so you can enjoy your guests. Book a free walkthrough today.', cta: 'Book a free walkthrough', imagePrompt: 'dining room set for dinner', audience: 'Homeowners', segment: null },
      { title: 'Pricey one', angle: 'discount', headline: '50% off deep cleans', primaryText: 'Get a deep clean for just $99 this month, guaranteed spotless results.', cta: 'Book', imagePrompt: 'kitchen', audience: 'Homeowners', segment: 'LEADS' },
    ] } }] }), { status: 200 });
  }) as typeof fetch;
  try {
    const r = await brainstorm(tenant.id, { goal: 'holiday bookings', count: 2 });
    assert.equal(r.usedModel, true);
    assert.equal(sent.tool_choice?.name, 'submit_concepts');
    const [good, bad] = r.ids;
    await editConcept(tenant.id, good, { status: 'APPROVED' });
    assert.equal((await getConcept(tenant.id, good)).status, 'APPROVED');
    await assert.rejects(() => editConcept(tenant.id, bad, { status: 'APPROVED' }), /price|claim/i);
    // Editing approved copy sends it back to draft.
    await editConcept(tenant.id, good, { headline: 'Hosting? Start clean' });
    assert.equal((await getConcept(tenant.id, good)).status, 'DRAFT');
  } finally {
    globalThis.fetch = real;
    delete process.env.ANTHROPIC_API_KEY;
  }
});

test('an approved idea becomes an unsent campaign draft, once', async () => {
  const { tenant, admin } = await seeded();
  const r = await brainstorm(tenant.id, { goal: 'ask for referrals', channel: 'TEXT', count: 1 });
  await assert.rejects(() => toCampaign(tenant.id, r.ids[0]), /Approve/);
  await editConcept(tenant.id, r.ids[0], { status: 'APPROVED' });
  const id = await toCampaign(tenant.id, r.ids[0], { id: admin.id, name: admin.name });
  const c = (await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1))[0]!;
  assert.equal(c.status, 'DRAFT');
  assert.equal(c.sentCount, 0);
  await assert.rejects(() => toCampaign(tenant.id, r.ids[0]), /already/);
});

test('Meta: only an approved, clean, budgeted idea is sent — and every object is created paused', async () => {
  const { tenant } = await seeded();
  process.env.META_APP_ID = 'app';
  process.env.META_APP_SECRET = 'secret';
  const real = globalThis.fetch;
  const calls: { url: string; body?: Record<string, unknown> }[] = [];
  globalThis.fetch = (async (input: unknown, init?: { body?: string; method?: string }) => {
    const url = String(input);
    calls.push({ url, body: init?.body ? JSON.parse(init.body) : undefined });
    const j = (o: unknown) => new Response(JSON.stringify(o), { status: 200 });
    if (url.includes('/oauth/access_token')) return j({ access_token: 'tok', expires_in: 5000000 });
    if (url.includes('/me/adaccounts')) return j({ data: [{ id: 'act_123', name: 'Acme Ads' }] });
    if (url.includes('/me/accounts')) return j({ data: [{ id: 'page9', name: 'Acme Page' }] });
    if (url.includes('/campaigns')) return j({ id: 'camp1' });
    if (url.includes('/adsets')) return j({ id: 'set1' });
    if (url.includes('/adcreatives')) return j({ id: 'cre1' });
    if (url.includes('/ads')) return j({ id: 'ad1' });
    return new Response('{}', { status: 404 });
  }) as typeof fetch;
  try {
    const r = await brainstorm(tenant.id, { goal: 'new customers', channel: 'META', count: 1 });
    const id = r.ids[0];
    await assert.rejects(() => publishPaused(tenant.id, id, 7), /Connect|Approve/);
    await connectMeta(tenant.id, null, 'code123', { name: 'test' });
    const conn = await getMeta(tenant.id);
    assert.ok(conn && conn.adAccountId === 'act_123' && conn.pageId === 'page9');
    assert.ok(!conn!.tokenSealed.includes('"tok"'));
    await assert.rejects(() => publishPaused(tenant.id, id, 7), /Approve/);
    await editConcept(tenant.id, id, { status: 'APPROVED' });
    await assert.rejects(() => publishPaused(tenant.id, id, 7), /ZIP/);
    await editConcept(tenant.id, id, { zips: '77494, 77450, abc', dailyBudgetCents: 999999 });
    await assert.rejects(() => publishPaused(tenant.id, id, 7), /capped/);
    await editConcept(tenant.id, id, { dailyBudgetCents: 1000 });
    const before = calls.length;
    const out = await publishPaused(tenant.id, id, 7);
    assert.equal(out.adId, 'ad1');
    const made = calls.slice(before).filter((c) => c.body);
    assert.equal(made.length, 4);
    for (const c of made.filter((m) => 'status' in (m.body ?? {}))) assert.equal(c.body!.status, 'PAUSED');
    const adset = made.find((m) => m.url.includes('/adsets'))!.body as { targeting: { geo_locations: { zips: { key: string }[] } }; daily_budget: number };
    assert.deepEqual(adset.targeting.geo_locations.zips.map((z) => z.key), ['US:77494', 'US:77450']);
    assert.equal(adset.daily_budget, 1000);
    assert.equal((await getConcept(tenant.id, id)).status, 'PUBLISHED');
    await assert.rejects(() => publishPaused(tenant.id, id, 7), /Already|Approve/);
  } finally {
    globalThis.fetch = real;
    delete process.env.META_APP_ID;
    delete process.env.META_APP_SECRET;
    await db.delete(metaConnections).where(eq(metaConnections.tenantId, tenant.id));
  }
});

test('Tex gives Muse only to office staff with marketing permission', async () => {
  const { tenant, admin, client } = await seeded();
  const base = { tenant, channel: 'WEB' as const, phone: null, conversationId: `web:test:${crypto.randomUUID()}`, verified: true, hasPin: false, open: true, handoff: false, transfer: false, articlesSeen: [] };
  const office: TexContext = { ...base, audience: 'ADMIN', userId: admin.id, userName: admin.name };
  const r = (await runTool(office, 'muse_brainstorm', { goal: 'book more deep cleans', channel: 'EMAIL', count: 2 })) as { ok?: boolean; drafts?: unknown[] };
  assert.equal(r.ok, true);
  assert.equal(r.drafts?.length, 2);
  const asClient: TexContext = { ...base, audience: 'CLIENT', userId: client.id, userName: client.name };
  const denied = (await runTool(asClient, 'muse_brainstorm', { goal: 'x y z' })) as { error?: string };
  assert.match(String(denied.error), /No tool/);
});
