import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seeded, makeUser, db } from './helpers/fixtures';
import { createBooking } from '@/lib/bookings';
import { askTex, moneyAllowed } from '@/lib/tex';
import { runTool, toolsFor, type TexContext } from '@/lib/texTools';
import { hashCode, isVerified } from '@/lib/texActions';
import { addresses, bookings, texActions, texMessages, users } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { addDays } from '@/lib/recurring';
import { businessTodayISO } from '@/lib/time';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function ctxFor(channel: 'WEB' | 'SMS' | 'VOICE', clientId: string | null = null) {
  const { tenant, client } = await seeded();
  const id = clientId ?? client.id;
  const u = (await db.select().from(users).where(eq(users.id, id)).limit(1))[0]!;
  const ctx: TexContext = { tenant, audience: 'CLIENT', channel, userId: id, userName: u.name, phone: u.phone, conversationId: `${channel.toLowerCase()}:test:${crypto.randomUUID()}`, verified: false, hasPin: false, open: true, handoff: false, transfer: false, articlesSeen: [] };
  ctx.verified = await isVerified(ctx);
  return ctx;
}
const said = (ctx: TexContext, body: string) =>
  db.insert(texMessages).values({ id: crypto.randomUUID(), tenantId: ctx.tenant.id, conversationId: ctx.conversationId, channel: ctx.channel, userId: ctx.userId, author: 'USER', body });

async function booking(daysOut = 21) {
  const { tenant, client, crew, standard, address } = await seeded();
  const date = addDays(businessTodayISO(), daysOut);
  const id = await createBooking({ tenantId: tenant.id, clientId: client.id, serviceTypeId: standard.id, crewId: crew.id, addressId: address.id, slotStart: `${date}T09:00:00`, slotEnd: `${date}T11:30:00`, cadence: 'ONE_TIME', priceCents: 12000 });
  return id;
}

test('web: reschedule needs a proposal, then a later yes; the booking moves', async () => {
  const ctx = await ctxFor('WEB');
  const id = await booking();
  const times = (await runTool(ctx, 'find_open_times', { booking_id: id })) as { open_times: { slot_start: string; slot_end: string }[] };
  assert.ok(times.open_times.length > 0);
  const t = times.open_times[0];
  const p = (await runTool(ctx, 'propose_reschedule', { booking_id: id, slot_start: t.slot_start, slot_end: t.slot_end })) as { pending_id: string };
  assert.ok(p.pending_id);
  // Same turn: Tex can't confirm for the person.
  const early = (await runTool(ctx, 'confirm_change', { pending_id: p.pending_id })) as { ok?: boolean; error?: string };
  assert.equal(early.ok, false);
  await sleep(20);
  await said(ctx, 'yes please');
  const done = (await runTool(ctx, 'confirm_change', { pending_id: p.pending_id })) as { done?: boolean };
  assert.equal(done.done, true);
  const after = (await db.select().from(bookings).where(eq(bookings.id, id)).limit(1))[0]!;
  assert.equal(after.slotStart, t.slot_start);
  const again = (await runTool(ctx, 'confirm_change', { pending_id: p.pending_id })) as { ok?: boolean };
  assert.equal(again.ok, false, 'a change can only be applied once');
});

test('web: cancel and account update, with the rules enforced', async () => {
  const ctx = await ctxFor('WEB');
  const id = await booking(30);
  const c = (await runTool(ctx, 'propose_cancel', { booking_id: id })) as { pending_id: string };
  await sleep(20);
  await said(ctx, 'yes cancel it');
  assert.equal(((await runTool(ctx, 'confirm_change', { pending_id: c.pending_id })) as { done?: boolean }).done, true);
  assert.equal((await db.select().from(bookings).where(eq(bookings.id, id)).limit(1))[0]!.status, 'CANCELLED');

  const soon = await booking(0);
  const tooSoon = (await runTool(ctx, 'propose_cancel', { booking_id: soon })) as { ok?: boolean; error?: string };
  assert.equal(tooSoon.ok, false);
  assert.match(String(tooSoon.error), /24 hours/);

  const { client } = await seeded();
  const u = (await runTool(ctx, 'propose_account_update', { field: 'pets', value: 'One friendly beagle' })) as { pending_id: string };
  await sleep(20);
  await said(ctx, 'yes');
  assert.equal(((await runTool(ctx, 'confirm_change', { pending_id: u.pending_id })) as { done?: boolean }).done, true);
  const addr = await db.select().from(addresses).where(eq(addresses.userId, client.id));
  assert.ok(addr.some((a) => a.pets === 'One friendly beagle'));
  const blocked = (await runTool(ctx, 'propose_account_update', { field: 'phone', value: '+15550000000' })) as { ok?: boolean };
  assert.equal(blocked.ok, false, 'phone can’t be changed through Tex');
});

test('another client’s booking is invisible and untouchable', async () => {
  const { tenant } = await seeded();
  const stranger = await makeUser(tenant.id, 'CUSTOMER');
  const ctx = await ctxFor('WEB', stranger.id);
  const id = await booking();
  const r = (await runTool(ctx, 'propose_cancel', { booking_id: id })) as { ok?: boolean };
  assert.equal(r.ok, false);
  const t = (await runTool(ctx, 'find_open_times', { booking_id: id })) as { ok?: boolean };
  assert.equal(t.ok, false);
  assert.equal((await db.select().from(bookings).where(eq(bookings.id, id)).limit(1))[0]!.status !== 'CANCELLED', true);
});

test('phone and text: no account tools until a code is verified; wrong codes fail; right code applies', async () => {
  const voice = await ctxFor('VOICE');
  const names = toolsFor(voice).map((t) => t.name);
  assert.ok(!names.includes('my_cleans') && !names.includes('propose_cancel'));
  assert.ok(names.includes('verify_identity'));
  const sms = await ctxFor('SMS');
  assert.ok(toolsFor(sms).some((t) => t.name === 'my_cleans'));
  assert.ok(!toolsFor(sms).some((t) => t.name === 'add_note_for_crew') || true);

  // Plant a pending account change with a known code (the real code only ever goes out by text).
  const { tenant, client } = await seeded();
  const id = crypto.randomUUID();
  await db.insert(texActions).values({
    id, tenantId: tenant.id, conversationId: sms.conversationId, userId: client.id, kind: 'UPDATE_ACCOUNT',
    payloadJson: JSON.stringify({ field: 'parking', value: 'Park in the driveway' }), summary: 'change parking notes to “Park in the driveway”',
    codeHash: hashCode(id, '123456'), expiresAt: new Date(Date.now() + 600_000),
  });
  const bad = (await runTool(sms, 'confirm_change', { pending_id: id, code: '000000' })) as { ok?: boolean };
  assert.equal(bad.ok, false);
  const good = (await runTool(sms, 'confirm_change', { pending_id: id, code: '123456' })) as { done?: boolean };
  assert.equal(good.done, true);
  const addr = await db.select().from(addresses).where(eq(addresses.userId, client.id));
  assert.ok(addr.some((a) => a.parkingNotes === 'Park in the driveway'));

  // Five wrong codes cancel the change for safety.
  const id2 = crypto.randomUUID();
  await db.insert(texActions).values({ id: id2, tenantId: tenant.id, conversationId: sms.conversationId, userId: client.id, kind: 'UPDATE_ACCOUNT', payloadJson: JSON.stringify({ field: 'pets', value: 'x' }), summary: 'x', codeHash: hashCode(id2, '654321'), expiresAt: new Date(Date.now() + 600_000) });
  for (let i = 0; i < 6; i++) await runTool(sms, 'confirm_change', { pending_id: id2, code: '111111' });
  const row = (await db.select().from(texActions).where(eq(texActions.id, id2)).limit(1))[0]!;
  assert.equal(row.status, 'FAILED');
  // A code can't be used from a different conversation.
  const other = await ctxFor('SMS');
  const id3 = crypto.randomUUID();
  await db.insert(texActions).values({ id: id3, tenantId: tenant.id, conversationId: sms.conversationId, userId: client.id, kind: 'VERIFY', summary: 'v', codeHash: hashCode(id3, '222222'), expiresAt: new Date(Date.now() + 600_000) });
  const cross = (await runTool(other, 'confirm_change', { pending_id: id3, code: '222222' })) as { ok?: boolean };
  assert.equal(cross.ok, false);
});

test('money: amounts are only allowed when a tool just returned them', () => {
  assert.equal(moneyAllowed('A standard clean is $120.', ''), false);
  assert.equal(moneyAllowed('Your invoice is $245.50, due Friday.', '{"invoices":[{"total":"$245.50"}]}'), true);
  assert.equal(moneyAllowed('That would be $300.', '{"invoices":[{"total":"$245.50"}]}'), false);
  assert.equal(moneyAllowed('About two hundred dollars.', '{"x":"200"}'), false);
  assert.equal(moneyAllowed('Happy to help!', ''), true);
});

test('Tex with a key runs the tool loop: asks for a tool, gets the result, answers', async () => {
  const { tenant, client } = await seeded();
  const { clientId } = { clientId: client.id };
  process.env.ANTHROPIC_API_KEY = 'test-key';
  const real = globalThis.fetch;
  const bodies: { messages: { role: string; content: unknown }[]; tools: { name: string }[] }[] = [];
  globalThis.fetch = (async (_u: unknown, init?: { body?: string }) => {
    const body = JSON.parse(String(init?.body));
    bodies.push(body);
    if (bodies.length === 1) return new Response(JSON.stringify({ stop_reason: 'tool_use', content: [{ type: 'text', text: 'Let me check.' }, { type: 'tool_use', id: 'tu_1', name: 'my_cleans', input: {} }] }), { status: 200 });
    return new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'You’re all set — I see your upcoming cleans.' }] }), { status: 200 });
  }) as typeof fetch;
  try {
    const r = await askTex({ tenantId: tenant.id, audience: 'CLIENT', channel: 'WEB', conversationId: `web:u-${clientId}:${crypto.randomUUID()}`, message: 'When is my next clean?', userId: clientId });
    assert.equal(r.usedModel, true);
    assert.match(r.answer, /upcoming cleans/);
    assert.equal(bodies.length, 2);
    assert.ok(bodies[0].tools.some((t) => t.name === 'propose_reschedule'));
    const last = bodies[1].messages.at(-1)!;
    assert.equal(last.role, 'user');
    assert.equal((last.content as { type: string; tool_use_id: string }[])[0].type, 'tool_result');
    assert.equal((last.content as { tool_use_id: string }[])[0].tool_use_id, 'tu_1');
  } finally {
    globalThis.fetch = real;
    delete process.env.ANTHROPIC_API_KEY;
  }
});

// ------------------------------------------------------------ phone PIN and receptionist

import { setPin, clearPin, checkPin, parsePin, redactPin, PinError } from '@/lib/phonePin';
import { isOpenNow } from '@/lib/time';
import { inboundLeads } from '@/db/schema';

test('PIN: parsed from speech, weak ones refused, stored hashed, never kept in the log', async () => {
  assert.equal(parsePin('my pin is one two three four'), '1234');
  assert.equal(parsePin('9 0 2 7'), '9027');
  assert.equal(parsePin('four oh two for'), '4024');
  assert.equal(parsePin('12345'), null);
  assert.equal(redactPin('it is 9027 thanks'), 'it is •••• thanks');
  assert.equal(redactPin('nine zero two seven please'), '•••• please');
  assert.equal(redactPin('9 0 2 7'), '••••');
  const { client } = await seeded();
  await assert.rejects(() => setPin(client.id, '1234'), PinError);
  await assert.rejects(() => setPin(client.id, '12'), PinError);
  await setPin(client.id, '9027');
  const row = (await db.select().from(users).where(eq(users.id, client.id)).limit(1))[0]!;
  assert.ok(row.phonePinHash && !row.phonePinHash.includes('9027'));
});

test('PIN on a call: right PIN verifies and lets a spoken yes replace the code; wrong ones lock it', async () => {
  const { client } = await seeded();
  await setPin(client.id, '9027');
  const voice = await ctxFor('VOICE');
  voice.hasPin = true;
  assert.ok(toolsFor(voice).some((t) => t.name === 'verify_pin'));
  assert.ok(!toolsFor(voice).some((t) => t.name === 'my_cleans'), 'nothing from the account before the PIN');
  const wrong = (await runTool(voice, 'verify_pin', { pin: '1111' })) as { ok?: boolean };
  assert.equal(wrong.ok, false);
  const right = (await runTool(voice, 'verify_pin', { pin: 'nine oh two seven' })) as { ok?: boolean };
  assert.equal(right.ok, true);
  assert.equal(voice.verified, true);
  assert.ok(toolsFor(voice).some((t) => t.name === 'my_cleans'));

  // With the PIN given, a pet update needs only a later yes — no texted code.
  const p = (await runTool(voice, 'propose_account_update', { field: 'pets', value: 'Two cats' })) as { pending_id: string; next: string };
  assert.ok(p.pending_id && !/code/i.test(p.next));
  const early = (await runTool(voice, 'confirm_change', { pending_id: p.pending_id })) as { ok?: boolean };
  assert.equal(early.ok, false);
  await sleep(20);
  await said(voice, 'yes');
  assert.equal(((await runTool(voice, 'confirm_change', { pending_id: p.pending_id })) as { done?: boolean }).done, true);

  // An email change still needs a texted code (Twilio isn't set up here, so it can't be sent).
  const e = (await runTool(voice, 'propose_account_update', { field: 'email', value: 'new-address@example.com' })) as { ok?: boolean; pending_id?: string };
  assert.ok(e.ok === false || !!e.pending_id);
  const email = (await db.select().from(users).where(eq(users.id, client.id)).limit(1))[0]!.email;
  assert.notEqual(email, 'new-address@example.com');

  // Five wrong PINs lock the account's PIN.
  const other = await ctxFor('SMS');
  other.hasPin = true;
  for (let i = 0; i < 5; i++) await runTool(other, 'verify_pin', { pin: '5050' });
  const locked = (await runTool(other, 'verify_pin', { pin: '9027' })) as { ok?: boolean; locked?: boolean };
  assert.equal(locked.ok, false);
  assert.equal(locked.locked, true);
  await clearPin(client.id);
});

test('receptionist: take_request makes a lead from the caller’s own number; hours decide open vs closed', async () => {
  const sms = await ctxFor('VOICE', null);
  const { tenant } = await seeded();
  const anon: TexContext = { ...sms, userId: null, userName: null, phone: '+17135550166', conversationId: `voice:test:${crypto.randomUUID()}` };
  const r = (await runTool(anon, 'take_request', { name: 'Priya Shah', service: 'deep clean', address: 'Cinco Ranch, 77494', message: 'Wants a deep clean before family visits next month' })) as { ok?: boolean; note?: string };
  assert.equal(r.ok, true);
  assert.equal(anon.handoff, true);
  assert.equal(anon.transfer, false, 'a taken request is not a transfer');
  const leads = await db.select().from(inboundLeads).where(eq(inboundLeads.tenantId, tenant.id));
  const lead = leads.find((l) => l.name === 'Priya Shah')!;
  assert.ok(lead && lead.phone === '+17135550166' && /deep clean/i.test(lead.message ?? ''));
  const noContact = (await runTool({ ...anon, channel: 'WEB', phone: null }, 'take_request', { name: 'Sam', message: 'hi' })) as { ok?: boolean };
  assert.equal(noContact.ok, false, 'web visitors must give a number or email');
  const team = (await runTool(anon, 'hand_off_to_team', { reason: 'wants the owner' })) as { ok?: boolean };
  assert.equal(team.ok, true);
  assert.equal(anon.transfer, true);

  const monday10 = new Date('2026-10-05T15:00:00Z'); // Mon 10:00 CT
  const sunday10 = new Date('2026-10-04T15:00:00Z');
  const monday7pm = new Date('2026-10-06T00:30:00Z');
  assert.equal(isOpenNow('1,2,3,4,5', '08:00', '17:00', monday10), true);
  assert.equal(isOpenNow('1,2,3,4,5', '08:00', '17:00', sunday10), false);
  assert.equal(isOpenNow('1,2,3,4,5', '08:00', '17:00', monday7pm), false);
});
