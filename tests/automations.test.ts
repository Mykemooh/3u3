import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seeded, makeUser, db } from './helpers/fixtures';
import {
  automationState,
  saveAutomation,
  renderTemplate,
  whenLabel,
  claimSend,
  sendReviewRequests,
  sendInvoiceFollowups,
  lapsedClients,
  AutomationError,
} from '@/lib/automations';
import { createBooking } from '@/lib/bookings';
import { createDraftInvoiceForBooking, replaceInvoiceItems, InvoiceError } from '@/lib/invoices';
import { recordReferral, ensureReferralCode, grantReferralReward } from '@/lib/referrals';
import { receiveInbound, listThreads, getThread, sendText, MessagingError } from '@/lib/messaging';
import { validTwilioSignature, phoneDigits } from '@/lib/sms';
import { verifyUnsubscribe, unsubscribeToken } from '@/lib/unsubscribe';
import { addDays } from '@/lib/recurring';
import { businessTodayISO } from '@/lib/time';
import { automationSends, bookings, invoices, invoiceItems, jobs, tenants, users } from '@/db/schema';
import { and, eq } from 'drizzle-orm';

let slot = 0;
async function booking(clientId: string, daysFromToday: number, priceCents = 15000) {
  const { tenant, crew, standard, address } = await seeded();
  slot += 1;
  const date = addDays(businessTodayISO(), daysFromToday);
  const h = String(6 + (slot % 12)).padStart(2, '0');
  const id = await createBooking({
    tenantId: tenant.id, clientId, serviceTypeId: standard.id, crewId: crew.id, addressId: address.id,
    slotStart: `${date}T${h}:00:00`, slotEnd: `${date}T${h}:50:00`, cadence: 'ONE_TIME', priceCents,
  });
  return id;
}

test('templates fill in their placeholders and leave unknown ones visible', () => {
  assert.equal(renderTemplate('Hi {firstName}, see you {date}.', { firstName: 'Ana', date: 'Friday' }), 'Hi Ana, see you Friday.');
  assert.equal(renderTemplate('Hi {firstNme}', { firstName: 'Ana' }), 'Hi {firstNme}', 'a typo stays visible rather than going blank');
  assert.equal(whenLabel(72), 'in 3 days');
  assert.equal(whenLabel(24), 'tomorrow');
  assert.equal(whenLabel(36), 'in 36 hours');
});

test('existing reminders default on, new ones default off; saving, timing and reset all stick', async () => {
  const { tenant, admin } = await seeded();
  assert.equal((await automationState(tenant.id, 'visit_reminder_first')).enabled, true);
  assert.equal((await automationState(tenant.id, 'review_request')).enabled, false);
  assert.equal((await automationState(tenant.id, 'visit_reminder_first')).offsetMinutes, 72 * 60);

  const saved = await saveAutomation(tenant.id, 'invoice_followup', { enabled: true, offset: 5, body: 'Pay {amount} please' }, { id: admin.id, name: admin.name });
  assert.equal(saved.enabled, true);
  assert.equal(saved.offsetMinutes, 5 * 1440, 'days are stored as minutes');
  assert.equal(saved.customized, true);

  const reset = await saveAutomation(tenant.id, 'invoice_followup', { subject: null, body: null });
  assert.equal(reset.customized, false);
  assert.equal(reset.enabled, true, 'resetting the wording keeps the toggle');
  await assert.rejects(saveAutomation(tenant.id, 'invoice_followup', { offset: -1 }), AutomationError);
  // Saving the standard words back counts as the standard message.
  const same = await saveAutomation(tenant.id, 'winback', { body: 'Hi {firstName}, it has been a little while since {company} last cleaned for you. Whenever you are ready, your crew would love to come back — book here: {link}' });
  assert.equal(same.customized, false);
});

test('a rule only ever claims a record once', async () => {
  const { tenant } = await seeded();
  const ref = crypto.randomUUID();
  assert.equal(await claimSend(tenant.id, 'test_rule', ref), true);
  assert.equal(await claimSend(tenant.id, 'test_rule', ref), false);
});

test('review requests go once per finished clean, only when turned on, only after the wait', async () => {
  const { tenant } = await seeded();
  const client = await makeUser(tenant.id, 'CUSTOMER');
  const bookingId = await booking(client.id, -1);
  const job = (await db.select().from(jobs).where(eq(jobs.bookingId, bookingId)))[0];
  await db.update(jobs).set({ status: 'COMPLETE', completedAt: new Date(Date.now() - 5 * 3600_000) }).where(eq(jobs.id, job.id));

  await saveAutomation(tenant.id, 'review_request', { enabled: false });
  await sendReviewRequests();
  let claimed = await db.select().from(automationSends).where(and(eq(automationSends.key, 'review_request'), eq(automationSends.refId, job.id)));
  assert.equal(claimed.length, 0, 'off means nothing is sent');

  await saveAutomation(tenant.id, 'review_request', { enabled: true, offset: 3 });
  await sendReviewRequests();
  await sendReviewRequests();
  claimed = await db.select().from(automationSends).where(and(eq(automationSends.key, 'review_request'), eq(automationSends.refId, job.id)));
  assert.equal(claimed.length, 1, 'two runs, one message');

  // A clean finished an hour ago isn't due yet with a 3-hour wait.
  const fresh = await booking(client.id, -1);
  const freshJob = (await db.select().from(jobs).where(eq(jobs.bookingId, fresh)))[0];
  await db.update(jobs).set({ status: 'COMPLETE', completedAt: new Date(Date.now() - 3600_000) }).where(eq(jobs.id, freshJob.id));
  await sendReviewRequests();
  claimed = await db.select().from(automationSends).where(and(eq(automationSends.key, 'review_request'), eq(automationSends.refId, freshJob.id)));
  assert.equal(claimed.length, 0);
  await saveAutomation(tenant.id, 'review_request', { enabled: false });
});

test('unpaid invoice reminders step up to three, spaced by the setting', async () => {
  const { tenant } = await seeded();
  const client = await makeUser(tenant.id, 'CUSTOMER');
  const bookingId = await booking(client.id, -10);
  await db.update(bookings).set({ status: 'COMPLETED' }).where(eq(bookings.id, bookingId));
  const invoiceId = await createDraftInvoiceForBooking(bookingId);
  await db.update(invoices).set({ status: 'SENT', sentAt: new Date(Date.now() - 7 * 86400_000) }).where(eq(invoices.id, invoiceId));
  await saveAutomation(tenant.id, 'invoice_followup', { enabled: true, offset: 3 });
  await sendInvoiceFollowups();
  const sends = await db.select().from(automationSends).where(eq(automationSends.key, 'invoice_followup'));
  const mine = sends.filter((s) => s.refId.startsWith(invoiceId));
  assert.deepEqual(mine.map((s) => s.refId), [`${invoiceId}:2`], 'seven days at a three-day spacing is the second reminder');
  await saveAutomation(tenant.id, 'invoice_followup', { enabled: false });
});

test('lapsed clients: finished long ago, nothing booked', async () => {
  const { tenant } = await seeded();
  const gone = await makeUser(tenant.id, 'CUSTOMER');
  const old = await booking(gone.id, -90);
  await db.update(bookings).set({ status: 'COMPLETED' }).where(eq(bookings.id, old));
  const busy = await makeUser(tenant.id, 'CUSTOMER');
  const oldBusy = await booking(busy.id, -90);
  await db.update(bookings).set({ status: 'COMPLETED' }).where(eq(bookings.id, oldBusy));
  await booking(busy.id, 12);
  const list = await lapsedClients(tenant.id, 60);
  assert.ok(list.some((l) => l.clientId === gone.id && l.lastBookingId === old));
  assert.ok(!list.some((l) => l.clientId === busy.id), 'someone with a clean booked is not lapsed');
  assert.ok(!(await lapsedClients(tenant.id, 120)).some((l) => l.clientId === gone.id), 'under the lapse window');
});

test('referral credit: recorded once, granted once when turned on, taken off the next invoice', async () => {
  const { tenant } = await seeded();
  const referrer = await makeUser(tenant.id, 'CUSTOMER');
  const friend = await makeUser(tenant.id, 'CUSTOMER');
  const code = await ensureReferralCode(referrer.id);
  assert.ok(code && code.length === 7);
  assert.equal(await ensureReferralCode(referrer.id), code, 'a client keeps their code');
  assert.equal(await recordReferral(friend.id, code!.toLowerCase(), tenant.id), true);
  assert.equal(await recordReferral(referrer.id, code, tenant.id), false, 'no self-referral');

  await saveAutomation(tenant.id, 'referral_rewards', { enabled: false });
  assert.equal(await grantReferralReward(tenant.id, friend.id), 0, 'off means no credit');
  await saveAutomation(tenant.id, 'referral_rewards', { enabled: true });
  await db.update(tenants).set({ referralCreditCents: 2500 }).where(eq(tenants.id, tenant.id));
  assert.equal(await grantReferralReward(tenant.id, friend.id), 2500);
  assert.equal(await grantReferralReward(tenant.id, friend.id), 0, 'only the first clean counts');
  const [f, r] = await Promise.all([friend.id, referrer.id].map(async (id) => (await db.select().from(users).where(eq(users.id, id)))[0]));
  assert.equal(f.creditCents, 2500);
  assert.equal(r.creditCents, 2500);

  // The friend's next invoice takes the credit as a minus line.
  const b = await booking(friend.id, -2, 10000);
  await db.update(bookings).set({ status: 'COMPLETED' }).where(eq(bookings.id, b));
  const invoiceId = await createDraftInvoiceForBooking(b);
  const inv = (await db.select().from(invoices).where(eq(invoices.id, invoiceId)))[0];
  assert.equal(inv.totalCents, 7500);
  const lines = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId));
  assert.ok(lines.some((l) => l.description === 'Referral credit' && l.amountCents === -2500));
  assert.equal((await db.select().from(users).where(eq(users.id, friend.id)))[0].creditCents, 0);

  // Editing keeps the credit line; credits can't exceed the invoice.
  await replaceInvoiceItems(invoiceId, lines.map((l) => ({ description: l.description, amountCents: l.amountCents })));
  assert.equal((await db.select().from(invoices).where(eq(invoices.id, invoiceId)))[0].totalCents, 7500);
  await assert.rejects(replaceInvoiceItems(invoiceId, [{ description: 'Clean', amountCents: 1000 }, { description: 'Credit', amountCents: -2000 }]), InvoiceError);
  await saveAutomation(tenant.id, 'referral_rewards', { enabled: false });
});

test('inbound texts find their client, file into one thread, and STOP blocks sending', async () => {
  const { tenant } = await seeded();
  const client = await makeUser(tenant.id, 'CUSTOMER', { phone: '(713) 555-0142' });
  const got = await receiveInbound({ from: '+17135550142', to: '+18325550000', body: 'Can you come at 10 instead?' });
  assert.equal(got?.tenant.id, tenant.id);
  assert.equal(got?.client?.id, client.id, 'matched however the phone was typed');
  let threads = await listThreads(tenant.id);
  const t = threads.find((x) => x.key === '7135550142');
  assert.ok(t);
  assert.equal(t!.unread, 1);
  assert.equal(t!.clientName, client.name);
  const msgs = await getThread(tenant.id, '7135550142');
  assert.equal(msgs.length, 1);
  threads = await listThreads(tenant.id);
  assert.equal(threads.find((x) => x.key === '7135550142')!.unread, 0, 'opening the thread marks it read');

  const stop = await receiveInbound({ from: '+17135550142', to: '+18325550000', body: 'stop' });
  assert.equal(stop?.consent, 'STOP');
  await assert.rejects(sendText({ tenantId: tenant.id, clientId: client.id, body: 'Hello' }), (e: unknown) => e instanceof MessagingError && /STOP/.test((e as Error).message));
  await receiveInbound({ from: '+17135550142', to: '+18325550000', body: 'START' });
  // Opted back in; without Twilio keys the send is refused with a setup hint.
  await assert.rejects(sendText({ tenantId: tenant.id, clientId: client.id, body: 'Hello' }), /connected/);
});

test('Twilio signatures and unsubscribe links verify; forgeries do not', async () => {
  assert.equal(phoneDigits('+1 (281) 555-0199'), '2815550199');
  assert.equal(validTwilioSignature('https://x.test/api/twilio/sms', { Body: 'hi' }, 'nope'), false);
  const id = crypto.randomUUID();
  assert.equal(verifyUnsubscribe(id, unsubscribeToken(id)), true);
  assert.equal(verifyUnsubscribe(id, unsubscribeToken(crypto.randomUUID())), false);
});
