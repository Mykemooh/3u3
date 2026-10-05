import { db } from '@/db/client';
import {
  automationSettings,
  automationSends,
  bookings,
  invoices,
  jobs,
  reviews,
  tenants,
  users,
  recurringSeries,
  serviceTypes,
} from '@/db/schema';
import { and, eq, gte, inArray, lte, ne, isNotNull } from 'drizzle-orm';
import { notifyClient } from '@/lib/notify';
import { simpleEmail } from '@/lib/email';
import { appUrl } from '@/lib/url';
import { businessLocalToUtc, businessTodayISO } from '@/lib/time';
import { formatDateLabel, formatSlotLabel } from '@/lib/scheduling';
import { logChange, diff } from '@/lib/audit';
import { unsubscribeUrl } from '@/lib/unsubscribe';
import { formatMoney, SERVICE_LABELS } from '@/lib/data';

/**
 * Reminders and follow-ups, as settings (Admin → Settings → Reminders &
 * follow-ups). Each one is a toggle, a "when", and the wording — a company
 * edits all three without touching code.
 *
 * The rules that already ran before this page existed (visit reminders,
 * quote follow-ups, "on the way", "all done") stay on by default and keep
 * their designed emails until someone edits the wording. Every rule added
 * since starts OFF, so nothing new goes to a company's clients until the
 * owner turns it on.
 *
 * Idempotency: the older rules keep their own sent-at columns; the newer
 * ones claim a row in automation_sends (tenant, key, record) before
 * sending, so a cron that runs twice — or two runs at once — never sends
 * the same message about the same record twice.
 */

export type AutomationKey =
  | 'visit_reminder_first'
  | 'visit_reminder_second'
  | 'walkthrough_reminder'
  | 'en_route'
  | 'job_complete'
  | 'review_request'
  | 'quote_followup'
  | 'invoice_followup'
  | 'winback'
  | 'referral_rewards';

export type AutomationGroup = 'Before the clean' | 'After the clean' | 'Quotes and invoices' | 'Growth';

export type AutomationDef = {
  key: AutomationKey;
  group: AutomationGroup;
  label: string;
  description: string;
  defaultEnabled: boolean;
  /** How far before/after the event. Stored in minutes; shown in `unit`. */
  timing?: { unit: 'hours' | 'days'; direction: 'before' | 'after'; default: number; choices: number[] };
  /** Wording a company can change. Null for rules that send no message. */
  text: { subject: string; body: string; vars: string[] } | null;
  /** True when, until edited, the rule sends a designed email instead of the plain one. */
  designedEmail?: boolean;
};

export const AUTOMATIONS: AutomationDef[] = [
  {
    key: 'walkthrough_reminder',
    group: 'Before the clean',
    label: 'Walkthrough reminder',
    description: 'Reminds a new lead about their free in-person walkthrough so you are not standing at a door nobody answers.',
    defaultEnabled: false,
    timing: { unit: 'hours', direction: 'before', default: 24, choices: [12, 24, 48] },
    text: {
      subject: 'See you {date} — your free walkthrough',
      body: 'Hi {firstName}, a reminder that {company} is coming by for your free walkthrough on {date}, {time}. It takes about 20 minutes and you will get your price on the spot. Need a different time? Just reply.',
      vars: ['firstName', 'company', 'date', 'time'],
    },
  },
  {
    key: 'visit_reminder_first',
    group: 'Before the clean',
    label: 'First visit reminder',
    description: 'A heads-up a few days before each clean, by the client’s chosen channel (email, text or WhatsApp).',
    defaultEnabled: true,
    timing: { unit: 'hours', direction: 'before', default: 72, choices: [48, 72, 96, 168] },
    text: {
      subject: 'Reminder: your {service} is {when}',
      body: 'Hi {firstName}, a heads-up that your {service} with {company} is {when}: {date}, {time}. Need to change it? You can from your account up to 24 hours before.',
      vars: ['firstName', 'company', 'service', 'date', 'time', 'when', 'link'],
    },
    designedEmail: true,
  },
  {
    key: 'visit_reminder_second',
    group: 'Before the clean',
    label: 'Second visit reminder',
    description: 'A closer reminder, so the client knows to leave the door code, crate the dog, or clear the counters.',
    defaultEnabled: true,
    timing: { unit: 'hours', direction: 'before', default: 36, choices: [12, 24, 36, 48] },
    text: {
      subject: 'Tomorrow-ish: your {service}',
      body: 'Hi {firstName}, your {service} with {company} is {when}: {date}, {time}. Anything the crew should know? Add a note in your account: {link}',
      vars: ['firstName', 'company', 'service', 'date', 'time', 'when', 'link'],
    },
    designedEmail: true,
  },
  {
    key: 'en_route',
    group: 'Before the clean',
    label: '“On the way” message',
    description: 'Sent when the crew taps Start driving, with a link to follow them on the map.',
    defaultEnabled: true,
    text: {
      subject: 'Your crew is on the way',
      body: 'Hi {firstName}, your {company} crew is on the way{eta}. Follow them here: {link}',
      vars: ['firstName', 'company', 'eta', 'link'],
    },
    designedEmail: true,
  },
  {
    key: 'job_complete',
    group: 'After the clean',
    label: '“All done” with photos',
    description: 'Sent the moment the crew finishes, with the before-and-after photos of every room.',
    defaultEnabled: true,
    text: {
      subject: 'Your home is clean — see the before and after',
      body: 'Hi {firstName}, your {service} is done. See the before-and-after photos of every room here: {link}',
      vars: ['firstName', 'company', 'service', 'link'],
    },
    designedEmail: true,
  },
  {
    key: 'review_request',
    group: 'After the clean',
    label: 'Ask for a review',
    description:
      'Asks how the clean went, room by room. Happy clients are offered your Google review link; anything rated 2 or lower opens a re-clean request for you instead.',
    defaultEnabled: false,
    timing: { unit: 'hours', direction: 'after', default: 3, choices: [1, 3, 24, 48] },
    text: {
      subject: 'How did we do, {firstName}?',
      body: 'Hi {firstName}, thanks for having {company} over. How did we do? Rate each room in about 20 seconds: {link}',
      vars: ['firstName', 'company', 'link'],
    },
  },
  {
    key: 'quote_followup',
    group: 'Quotes and invoices',
    label: 'Quote follow-ups',
    description: 'Nudges a client who hasn’t answered a quote: after 1 day, 4 days, 6 days, then weekly until they answer or opt out.',
    defaultEnabled: true,
    text: {
      subject: 'Still thinking it over? Your quote — {amount}',
      body: 'Hi {firstName}, just checking in — your {service} quote from {company} ({amount}) is still waiting on you: {link}',
      vars: ['firstName', 'company', 'service', 'amount', 'link'],
    },
    designedEmail: true,
  },
  {
    key: 'invoice_followup',
    group: 'Quotes and invoices',
    label: 'Unpaid invoice reminders',
    description: 'Reminds a client about an unpaid invoice, up to three times, spaced this many days apart.',
    defaultEnabled: false,
    timing: { unit: 'days', direction: 'after', default: 3, choices: [2, 3, 5, 7] },
    text: {
      subject: 'A reminder about your invoice — {amount}',
      body: 'Hi {firstName}, a friendly reminder that your invoice from {company} for {amount} is still open. You can pay it here: {link}',
      vars: ['firstName', 'company', 'amount', 'link'],
    },
  },
  {
    key: 'winback',
    group: 'Growth',
    label: 'Win back lapsed clients',
    description:
      'One friendly note to a client whose last clean was longer ago than your “lapsed after” setting (Settings → Reviews and referrals) and who has nothing booked. Sent once per lapse; clients who unsubscribed are skipped.',
    defaultEnabled: false,
    text: {
      subject: 'We miss your home, {firstName}',
      body: 'Hi {firstName}, it has been a little while since {company} last cleaned for you. Whenever you are ready, your crew would love to come back — book here: {link}',
      vars: ['firstName', 'company', 'link'],
    },
  },
  {
    key: 'referral_rewards',
    group: 'Growth',
    label: 'Referral credit',
    description:
      'When someone a client referred finishes their first clean, both get the referral credit you set (Settings → Reviews and referrals), applied to their next invoice.',
    defaultEnabled: false,
    text: null,
  },
];

export const automationDef = (key: AutomationKey) => AUTOMATIONS.find((a) => a.key === key)!;

export type AutomationState = {
  key: AutomationKey;
  enabled: boolean;
  offsetMinutes: number | null;
  subject: string | null;
  body: string | null;
  customized: boolean;
};

const toMinutes = (def: AutomationDef, n: number) => (def.timing?.unit === 'days' ? n * 1440 : n * 60);
export const fromMinutes = (def: AutomationDef, minutes: number) => (def.timing?.unit === 'days' ? minutes / 1440 : minutes / 60);

export async function automationStates(tenantId: string): Promise<Record<AutomationKey, AutomationState>> {
  const rows = await db.select().from(automationSettings).where(eq(automationSettings.tenantId, tenantId));
  const out = {} as Record<AutomationKey, AutomationState>;
  for (const def of AUTOMATIONS) {
    const row = rows.find((r) => r.key === def.key);
    out[def.key] = {
      key: def.key,
      enabled: row ? row.enabled : def.defaultEnabled,
      offsetMinutes: row?.offsetMinutes ?? (def.timing ? toMinutes(def, def.timing.default) : null),
      subject: row?.subject ?? null,
      body: row?.body ?? null,
      customized: !!(row?.subject || row?.body),
    };
  }
  return out;
}

export async function automationState(tenantId: string, key: AutomationKey) {
  return (await automationStates(tenantId))[key];
}

export class AutomationError extends Error {
  status = 400;
}

export async function saveAutomation(
  tenantId: string,
  key: AutomationKey,
  patch: { enabled?: boolean; offset?: number | null; subject?: string | null; body?: string | null },
  actor?: { id: string; name: string },
) {
  const def = AUTOMATIONS.find((a) => a.key === key);
  if (!def) throw new AutomationError('Unknown reminder.');
  const before = await automationState(tenantId, key);
  let offsetMinutes = before.offsetMinutes;
  if (patch.offset !== undefined && def.timing) {
    if (patch.offset == null || !(patch.offset > 0) || patch.offset > (def.timing.unit === 'days' ? 60 : 24 * 30)) {
      throw new AutomationError('Pick a sensible time.');
    }
    offsetMinutes = toMinutes(def, patch.offset);
  }
  const clean = (s: string | null | undefined) => (s == null ? null : s.trim() || null);
  let subject = patch.subject !== undefined ? clean(patch.subject) : before.subject;
  let body = patch.body !== undefined ? clean(patch.body) : before.body;
  // Saving the default wording back is the same as "use the standard message".
  if (def.text && subject === def.text.subject) subject = null;
  if (def.text && body === def.text.body) body = null;
  if (body && body.length > 1200) throw new AutomationError('Keep the message under 1,200 characters.');
  if (subject && subject.length > 140) throw new AutomationError('Keep the subject under 140 characters.');
  const enabled = patch.enabled ?? before.enabled;

  await db
    .insert(automationSettings)
    .values({ id: crypto.randomUUID(), tenantId, key, enabled, offsetMinutes, subject, body })
    .onConflictDoUpdate({
      target: [automationSettings.tenantId, automationSettings.key],
      set: { enabled, offsetMinutes, subject, body, updatedAt: new Date() },
    });
  await logChange({
    tenantId,
    actor: actor ?? null,
    entityType: 'automation',
    entityId: key,
    action: 'update',
    summary: `${def.label}: ${enabled ? 'on' : 'off'}`,
    changes: diff(
      { enabled: before.enabled, offsetMinutes: before.offsetMinutes, subject: before.subject, body: before.body },
      { enabled, offsetMinutes, subject, body },
    ),
  });
  return automationState(tenantId, key);
}

/** {firstName} → value. Unknown placeholders are left as typed so a typo is visible, not silently blank. */
export function renderTemplate(template: string, vars: Record<string, string | null | undefined>) {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => (vars[name] != null ? String(vars[name]) : whole));
}

/** The words a rule will actually send: the company's own if they edited it, else the standard wording. */
export function wordingFor(def: AutomationDef, state: AutomationState) {
  return { subject: state.subject ?? def.text?.subject ?? '', body: state.body ?? def.text?.body ?? '' };
}

/** "in 3 days", "in 36 hours", "tomorrow" — for the visit reminders. */
export function whenLabel(hours: number) {
  if (hours <= 30 && hours >= 18) return 'tomorrow';
  if (hours % 24 === 0) return `in ${hours / 24} day${hours === 24 ? '' : 's'}`;
  return `in ${hours} hours`;
}

/**
 * First send of this rule about this record? Claims it atomically so two
 * cron runs at once can't both send.
 */
export async function claimSend(tenantId: string, key: string, refId: string) {
  const rows = await db
    .insert(automationSends)
    .values({ id: crypto.randomUUID(), tenantId, key, refId })
    .onConflictDoNothing()
    .returning({ id: automationSends.id });
  return rows.length > 0;
}

/** Sends a rule's message (in the company's wording) to one client, on their chosen channel. */
export async function sendAutomationMessage(input: {
  tenantId: string;
  tenantName: string;
  key: AutomationKey;
  state: AutomationState;
  client: typeof users.$inferSelect;
  vars: Record<string, string | null | undefined>;
  cta?: { label: string; url: string };
  relatedBookingId?: string;
  marketing?: boolean;
  /** An extra line at the foot of the email (for example "Stop these reminders"). */
  footerNote?: string;
}) {
  const def = automationDef(input.key);
  const words = wordingFor(def, input.state);
  const vars = { company: input.tenantName, firstName: input.client.name.split(/[\s(]/)[0], ...input.vars };
  const subject = renderTemplate(words.subject, vars);
  const body = renderTemplate(words.body, vars);
  const footer = input.marketing
    ? `— ${input.tenantName}\nDon't want these? Unsubscribe: ${unsubscribeUrl(input.client.id)}`
    : input.footerNote
    ? `— ${input.tenantName}\n${input.footerNote}`
    : undefined;
  return notifyClient({
    tenantId: input.tenantId,
    client: input.client,
    triggerEvent: `AUTOMATION_${input.key.toUpperCase()}`,
    relatedBookingId: input.relatedBookingId,
    email: { subject, html: simpleEmail({ brandName: input.tenantName, heading: subject, body, cta: input.cta, footer }) },
    text: body,
  });
}

// ---------------------------------------------------------------------------
// The sweeps the daily cron runs (app/api/cron/reminders).
// ---------------------------------------------------------------------------

const HOUR = 3600_000;

async function activeTenants() {
  return db.select().from(tenants).where(eq(tenants.isPlatform, false));
}

async function serviceNameFor(serviceTypeId: string | null) {
  if (!serviceTypeId) return 'cleaning';
  const s = (await db.select().from(serviceTypes).where(eq(serviceTypes.id, serviceTypeId)).limit(1))[0];
  return s ? SERVICE_LABELS[s.key as keyof typeof SERVICE_LABELS] ?? s.name : 'cleaning';
}

/** Free walkthrough reminders, for quote-visit bookings. */
export async function sendWalkthroughReminders(now = Date.now()) {
  let sent = 0;
  for (const tenant of await activeTenants()) {
    const state = await automationState(tenant.id, 'walkthrough_reminder');
    if (!state.enabled || !state.offsetMinutes) continue;
    const rows = await db
      .select()
      .from(bookings)
      .where(and(eq(bookings.tenantId, tenant.id), eq(bookings.isQuoteVisit, true), inArray(bookings.status, ['REQUESTED', 'CONFIRMED']), gte(bookings.slotStart, businessTodayISO())));
    for (const b of rows) {
      const hoursUntil = (businessLocalToUtc(b.slotStart).getTime() - now) / HOUR;
      if (hoursUntil <= 0 || hoursUntil > state.offsetMinutes / 60) continue;
      const client = (await db.select().from(users).where(eq(users.id, b.clientId)).limit(1))[0];
      if (!client) continue;
      if (!(await claimSend(tenant.id, 'walkthrough_reminder', b.id))) continue;
      await sendAutomationMessage({
        tenantId: tenant.id,
        tenantName: tenant.name,
        key: 'walkthrough_reminder',
        state,
        client,
        vars: { date: formatDateLabel(b.slotStart.slice(0, 10)), time: formatSlotLabel(b.slotStart, b.slotEnd) },
        relatedBookingId: b.id,
      });
      sent += 1;
    }
  }
  return sent;
}

/** "How did we do?" — finished cleans with no review yet, sent once, within two weeks of the clean. */
export async function sendReviewRequests(now = Date.now()) {
  let sent = 0;
  for (const tenant of await activeTenants()) {
    const state = await automationState(tenant.id, 'review_request');
    if (!state.enabled || !state.offsetMinutes) continue;
    const due = new Date(now - state.offsetMinutes * 60_000);
    const oldest = new Date(now - 14 * 24 * HOUR);
    const done = await db
      .select({ job: jobs, booking: bookings })
      .from(jobs)
      .innerJoin(bookings, eq(bookings.id, jobs.bookingId))
      .where(and(eq(bookings.tenantId, tenant.id), eq(jobs.status, 'COMPLETE'), isNotNull(jobs.completedAt), lte(jobs.completedAt, due), gte(jobs.completedAt, oldest)));
    if (!done.length) continue;
    const reviewed = new Set(
      (await db.select({ bookingId: reviews.bookingId }).from(reviews).where(inArray(reviews.bookingId, done.map((d) => d.booking.id)))).map((r) => r.bookingId),
    );
    for (const { job, booking } of done) {
      if (reviewed.has(booking.id)) continue;
      const client = (await db.select().from(users).where(eq(users.id, booking.clientId)).limit(1))[0];
      if (!client) continue;
      if (!(await claimSend(tenant.id, 'review_request', job.id))) continue;
      const link = appUrl(`/account/jobs/${job.id}#rate`);
      await sendAutomationMessage({
        tenantId: tenant.id,
        tenantName: tenant.name,
        key: 'review_request',
        state,
        client,
        vars: { link },
        cta: { label: 'Rate your clean', url: link },
        relatedBookingId: booking.id,
      });
      sent += 1;
    }
  }
  return sent;
}

/** Unpaid invoices: up to three reminders, `offset` days apart, counted from when the invoice was sent. */
export async function sendInvoiceFollowups(now = Date.now()) {
  let sent = 0;
  for (const tenant of await activeTenants()) {
    const state = await automationState(tenant.id, 'invoice_followup');
    if (!state.enabled || !state.offsetMinutes) continue;
    const open = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.tenantId, tenant.id), eq(invoices.status, 'SENT'), isNotNull(invoices.sentAt)));
    for (const inv of open) {
      if (inv.batchId) continue; // folded into a monthly charge
      const step = Math.min(3, Math.floor((now - inv.sentAt!.getTime()) / (state.offsetMinutes * 60_000)));
      if (step < 1) continue;
      const client = (await db.select().from(users).where(eq(users.id, inv.clientId)).limit(1))[0];
      if (!client) continue;
      if (!(await claimSend(tenant.id, 'invoice_followup', `${inv.id}:${step}`))) continue;
      const link = inv.hostedInvoiceUrl ?? appUrl(`/account/invoices/${inv.id}`);
      await sendAutomationMessage({
        tenantId: tenant.id,
        tenantName: tenant.name,
        key: 'invoice_followup',
        state,
        client,
        vars: { amount: formatMoney(inv.totalCents), link },
        cta: { label: 'View and pay', url: link },
        relatedBookingId: inv.bookingId,
      });
      sent += 1;
    }
  }
  return sent;
}

/**
 * Clients who have gone quiet: last finished clean older than the
 * company's "lapsed after" days, nothing booked, no active recurring
 * series, not unsubscribed. Once per lapse — a client who comes back and
 * lapses again can hear from you again.
 */
export async function lapsedClients(tenantId: string, winbackDays: number, today = businessTodayISO()) {
  const cutoff = new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10) - winbackDays)).toISOString().slice(0, 10);
  const all = await db
    .select()
    .from(bookings)
    .where(and(eq(bookings.tenantId, tenantId), eq(bookings.isQuoteVisit, false), ne(bookings.status, 'CANCELLED')));
  const byClient = new Map<string, typeof all>();
  for (const b of all) byClient.set(b.clientId, [...(byClient.get(b.clientId) ?? []), b]);
  const activeSeries = new Set(
    (await db.select({ clientId: recurringSeries.clientId }).from(recurringSeries).where(and(eq(recurringSeries.tenantId, tenantId), eq(recurringSeries.status, 'ACTIVE')))).map(
      (s) => s.clientId,
    ),
  );
  const out: { clientId: string; lastBookingId: string; lastDate: string }[] = [];
  for (const [clientId, list] of byClient) {
    if (activeSeries.has(clientId)) continue;
    if (list.some((b) => b.slotStart.slice(0, 10) >= today)) continue;
    const done = list.filter((b) => b.status === 'COMPLETED').sort((a, b) => b.slotStart.localeCompare(a.slotStart));
    if (!done.length) continue;
    if (done[0].slotStart.slice(0, 10) > cutoff) continue;
    out.push({ clientId, lastBookingId: done[0].id, lastDate: done[0].slotStart.slice(0, 10) });
  }
  return out;
}

export async function sendWinbacks() {
  let sent = 0;
  for (const tenant of await activeTenants()) {
    const state = await automationState(tenant.id, 'winback');
    if (!state.enabled) continue;
    for (const lapsed of await lapsedClients(tenant.id, tenant.winbackDays)) {
      const client = (await db.select().from(users).where(eq(users.id, lapsed.clientId)).limit(1))[0];
      if (!client || !client.isActive || client.marketingOptOut) continue;
      if (!(await claimSend(tenant.id, 'winback', `${client.id}:${lapsed.lastBookingId}`))) continue;
      const link = appUrl('/account');
      await sendAutomationMessage({
        tenantId: tenant.id,
        tenantName: tenant.name,
        key: 'winback',
        state,
        client,
        vars: { link },
        cta: { label: 'Book a clean', url: link },
        marketing: true,
      });
      sent += 1;
    }
  }
  return sent;
}

export async function runAutomations() {
  const [walkthrough, review, invoice, winback] = [
    await sendWalkthroughReminders(),
    await sendReviewRequests(),
    await sendInvoiceFollowups(),
    await sendWinbacks(),
  ];
  return { walkthrough, review, invoice, winback };
}
