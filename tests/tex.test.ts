import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seeded, makeUser, db } from './helpers/fixtures';
import { articlesFor, search, saveArticle, visibleTo } from '@/lib/help';
import { HELP_ARTICLES } from '@/lib/help/content';
import { askTex, texReplyToText, listTexConversations, markHandled } from '@/lib/tex';
import { recordOutbound } from '@/lib/messaging';
import { notificationLog, texMessages } from '@/db/schema';
import { and, eq, like } from 'drizzle-orm';

const cid = () => `web:test:${crypto.randomUUID()}`;

test('help: every article is well-formed and readers only see their own audience', async () => {
  const slugs = new Set<string>();
  for (const a of HELP_ARTICLES) {
    assert.ok(!slugs.has(a.slug), `duplicate slug ${a.slug}`);
    slugs.add(a.slug);
    assert.ok(a.audience.length && a.tags.length && a.body.length > 40, a.slug);
    assert.ok(!/\$\d/.test(a.body) || a.audience.every((x) => x === 'ADMIN'), `${a.slug}: no prices in anything clients or crews read`);
  }
  assert.deepEqual(visibleTo('CLIENT'), ['PUBLIC', 'CLIENT']);
  const { tenant } = await seeded();
  const pub = await articlesFor(tenant.id, 'PUBLIC', tenant.name);
  assert.ok(pub.every((a) => a.audience.includes('PUBLIC')));
  assert.ok(!pub.some((a) => a.slug === 'sop-payroll'), 'office SOPs are not public');
  assert.ok(pub.every((a) => !a.body.includes('{company}')), 'company name filled in');
});

test('search finds the right article and prefers the company’s own', async () => {
  const { tenant, admin } = await seeded();
  const list = await articlesFor(tenant.id, 'CLIENT', tenant.name);
  assert.equal(search(list, 'can I reschedule my cleaning?')[0]?.article.slug, 'reschedule-or-cancel');
  assert.equal(search(list, 'where are the before and after pictures')[0]?.article.slug, 'before-and-after-photos');
  await saveArticle(tenant.id, { title: 'What is your cancellation policy?', body: 'Cancel or reschedule free up to 24 hours before. Later than that, call us.', audience: 'PUBLIC', kind: 'FAQ', tags: 'cancel, cancellation, policy, reschedule', published: true }, { id: admin.id, name: admin.name });
  const again = await articlesFor(tenant.id, 'CLIENT', tenant.name);
  assert.equal(search(again, 'what is your cancellation policy')[0]?.article.source, 'COMPANY');
});

test('Tex without an AI key: answers from articles, never prices, hands off when asked or stuck', async () => {
  delete process.env.ANTHROPIC_API_KEY;
  const { tenant } = await seeded();
  const price = await askTex({ tenantId: tenant.id, audience: 'PUBLIC', channel: 'WEB', conversationId: cid(), message: 'How much does a deep clean cost?' });
  assert.ok(!/\$\s?\d/.test(price.answer));
  assert.match(price.answer, /walkthrough/i);
  assert.equal(price.handoff, false);
  assert.equal(price.usedModel, false);

  const human = await askTex({ tenantId: tenant.id, audience: 'PUBLIC', channel: 'WEB', conversationId: cid(), message: 'Can I talk to a real person please' });
  assert.equal(human.handoff, true);
  const alerts = await db.select().from(notificationLog).where(and(eq(notificationLog.tenantId, tenant.id), like(notificationLog.triggerEvent, 'TEX_HANDOFF%')));
  assert.ok(alerts.length >= 1, 'the team is alerted');

  const stuck = await askTex({ tenantId: tenant.id, audience: 'PUBLIC', channel: 'SMS', conversationId: cid(), message: 'zxqv blorf' });
  assert.equal(stuck.handoff, true);
  const voice = await askTex({ tenantId: tenant.id, audience: 'PUBLIC', channel: 'VOICE', conversationId: cid(), message: 'Do I need to be home for the cleaners?' });
  assert.ok(!/https?:|^- /m.test(voice.answer), 'spoken answers have no links or bullets');
  assert.ok(voice.answer.length <= 420);
});

test('Tex with an AI key: a dollar amount in the model’s answer is replaced', async () => {
  const { tenant } = await seeded();
  process.env.ANTHROPIC_API_KEY = 'test-key';
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ content: [{ type: 'text', text: '{"answer":"A standard clean is $120.","handoff":false,"used":[1]}' }] }), { status: 200 })) as typeof fetch;
  try {
    const r = await askTex({ tenantId: tenant.id, audience: 'PUBLIC', channel: 'WEB', conversationId: cid(), message: 'price of a standard clean?' });
    assert.equal(r.usedModel, true);
    assert.ok(!r.answer.includes('$120'));
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.ANTHROPIC_API_KEY;
  }
});

test('Tex by text stays quiet when a person replied recently; conversations show what needs the team', async () => {
  const { tenant, admin } = await seeded();
  const client = await makeUser(tenant.id, 'CUSTOMER', { phone: '+17135550188' });
  await recordOutbound({ tenantId: tenant.id, clientId: client.id, from: '+18325550000', to: '+17135550188', body: 'Hi Ana, it’s Mike — see you Thursday.', sentByUserId: admin.id });
  const skipped = await texReplyToText({ tenant, client, from: '+17135550188', body: 'Thanks! Do I need to be home?' });
  assert.deepEqual(skipped, { skipped: 'staff' });

  const other = await makeUser(tenant.id, 'CUSTOMER', { phone: '+17135550189' });
  const replied = await texReplyToText({ tenant, client: other, from: '+17135550189', body: 'Can I talk to someone about a refund?' });
  assert.ok(replied && 'reply' in replied && replied.reply?.handoff);
  const convs = await listTexConversations(tenant.id);
  const mine = convs.find((c) => c.id === 'sms:7135550189')!;
  assert.equal(mine.needsYou, true);
  await markHandled(tenant.id, mine.id, { id: admin.id, name: admin.name });
  assert.equal((await listTexConversations(tenant.id)).find((c) => c.id === mine.id)!.needsYou, false);
  const saved = await db.select().from(texMessages).where(eq(texMessages.conversationId, 'sms:7135550189'));
  assert.ok(saved.some((m) => m.author === 'USER') && saved.some((m) => m.author === 'TEX'));
});
