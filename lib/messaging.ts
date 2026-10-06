import { redactPin } from '@/lib/phonePin';
import { db } from '@/db/client';
import { smsMessages, tenants, users, notificationLog } from '@/db/schema';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { sendSmsDetailed, smsConfigured, toE164, phoneDigits } from '@/lib/sms';

/**
 * Two-way texting (Admin → Messages). Every text in or out — typed by
 * staff, sent by a reminder, or answered by Tex — lands in sms_messages,
 * so a client's thread reads as one conversation. A thread is keyed by the
 * other party's number, not the client record, so a text from a number
 * nobody has on file still shows up (as "Unknown number").
 *
 * STOP / START are honoured and recorded (users.smsConsent): carriers
 * require it, and Twilio's own opt-out handling blocks the next send
 * anyway — recording it here lets the inbox say why.
 */

export class MessagingError extends Error {
  status = 400;
}

const STOP_WORDS = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'];
const START_WORDS = ['START', 'YES', 'UNSTOP'];

/** The first company on the platform — the one that owns the platform's own texting number. */
export async function homeTenantId() {
  return (await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.isPlatform, false)).orderBy(asc(tenants.createdAt)).limit(1))[0]?.id ?? null;
}

const platformNumber = () => toE164(process.env.TWILIO_FROM_NUMBER ?? '') ?? null;

/**
 * The number a company texts from: its own (Settings → Texting and Tex),
 * or — for the platform's first company only — the platform's
 * TWILIO_FROM_NUMBER. Any other company without its own number can't
 * text, so its messages go by email instead of borrowing someone else's
 * number.
 */
export async function tenantSmsNumber(tenantId: string) {
  const t = (await db.select({ smsNumber: tenants.smsNumber }).from(tenants).where(eq(tenants.id, tenantId)).limit(1))[0];
  if (t?.smsNumber) return t.smsNumber;
  return tenantId === (await homeTenantId()) ? platformNumber() : null;
}

/** Is this number on the platform's Twilio account? (null when Twilio isn't set up, so it can't be checked.) */
async function twilioOwnsNumber(e164: string): Promise<boolean | null> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const auth = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !auth) return null;
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(e164)}`, {
      headers: { Authorization: `Basic ${Buffer.from(`${sid}:${auth}`).toString('base64')}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { incoming_phone_numbers?: unknown[] };
    return (data.incoming_phone_numbers ?? []).length > 0;
  } catch {
    return null;
  }
}

/**
 * Before a company saves a texting number: it must be on the platform's
 * Twilio account and not already another company's — otherwise anyone
 * could route someone else's texts and calls to themselves. While Twilio
 * isn't set up (so numbers can't be checked), only the platform's first
 * company can save one.
 */
export async function checkSmsNumber(tenantId: string, e164: string) {
  const other = (await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.smsNumber, e164)).limit(1))[0];
  if (other && other.id !== tenantId) throw new MessagingError('That number already belongs to another company.');
  const home = await homeTenantId();
  if (e164 === platformNumber() && tenantId !== home) throw new MessagingError('That is the platform’s shared number. Ask the platform owner for a number of your own.');
  const owned = await twilioOwnsNumber(e164);
  if (owned === false) throw new MessagingError('That number isn’t on the texting account. Ask the platform owner to add it, then save it here.');
  if (owned === null && tenantId !== home) throw new MessagingError('Texting numbers can be added once the platform owner has connected Twilio.');
}

export async function clientByPhone(digits: string, tenantId?: string) {
  const rows = await db
    .select()
    .from(users)
    .where(
      and(
        sql`right(regexp_replace(coalesce(${users.phone}, ''), '\\D', '', 'g'), 10) = ${digits}`,
        tenantId ? eq(users.tenantId, tenantId) : undefined,
      ),
    )
    .limit(1);
  return rows[0];
}

export async function recordOutbound(input: {
  tenantId: string;
  clientId: string | null;
  from: string;
  to: string;
  body: string;
  sid?: string | null;
  sentByUserId?: string | null;
  sentByTex?: boolean;
}) {
  const id = crypto.randomUUID();
  await db.insert(smsMessages).values({
    id,
    tenantId: input.tenantId,
    clientId: input.clientId,
    direction: 'OUT',
    fromNumber: toE164(input.from) ?? input.from,
    toNumber: toE164(input.to) ?? input.to,
    body: redactPin(input.body),
    twilioSid: input.sid ?? null,
    sentByUserId: input.sentByUserId ?? null,
    sentByTex: input.sentByTex ?? false,
    readAt: new Date(),
  });
  return id;
}

/** Staff (or Tex) texting a client from the company's number. */
export async function sendText(input: { tenantId: string; clientId?: string | null; phone?: string | null; body: string; userId?: string | null; byTex?: boolean }) {
  const body = input.body.trim();
  if (!body) throw new MessagingError('Type a message first.');
  if (body.length > 1000) throw new MessagingError('Keep texts under 1,000 characters.');
  let client = input.clientId
    ? (await db.select().from(users).where(and(eq(users.id, input.clientId), eq(users.tenantId, input.tenantId))).limit(1))[0]
    : undefined;
  if (input.clientId && !client) throw new MessagingError('Client not found.');
  const phone = client?.phone ?? input.phone ?? null;
  const digits = phoneDigits(phone);
  if (!digits) throw new MessagingError('That client has no mobile number on file.');
  if (!client) client = await clientByPhone(digits, input.tenantId);
  if (client?.smsConsent === false) throw new MessagingError(`${client.name.split(' ')[0]} replied STOP, so texts to them are blocked. They can text START to opt back in.`);
  if (!smsConfigured()) throw new MessagingError('Texting isn’t connected yet. Add your Twilio keys (Settings → Integrations) and texts will send from your business number.');
  const from = await tenantSmsNumber(input.tenantId);
  if (!from) throw new MessagingError('Add your business texting number in Settings → Texting and Tex first.');
  const sent = await sendSmsDetailed({ to: phone!, body, from });
  if (!sent.ok) throw new MessagingError('The text didn’t go through. Check the number and try again.');
  const id = await recordOutbound({
    tenantId: input.tenantId,
    clientId: client?.id ?? null,
    from: sent.from ?? from ?? '',
    to: sent.to ?? phone!,
    body,
    sid: sent.sid,
    sentByUserId: input.userId ?? null,
    sentByTex: input.byTex ?? false,
  });
  return { id };
}

/**
 * Which company an inbound text or call belongs to. A company's own
 * number is unambiguous. On the platform's shared number, it's the company
 * that last texted that person from it, then the company that has them as
 * a client, then the platform's first company. Any other number: nobody.
 */
export async function tenantForInbound(to: string, from: string) {
  const toE = toE164(to);
  if (!toE) return null;
  const all = await db.select().from(tenants).where(eq(tenants.isPlatform, false)).orderBy(asc(tenants.createdAt));
  const byNumber = all.find((t) => t.smsNumber === toE);
  if (byNumber) return byNumber;
  if (toE !== platformNumber()) return null;
  const fromDigits = phoneDigits(from);
  if (fromDigits) {
    const lastOut = (
      await db
        .select({ tenantId: smsMessages.tenantId })
        .from(smsMessages)
        .where(
          and(
            eq(smsMessages.direction, 'OUT'),
            eq(smsMessages.fromNumber, toE),
            sql`right(regexp_replace(${smsMessages.toNumber}, '\\D', '', 'g'), 10) = ${fromDigits}`,
          ),
        )
        .orderBy(desc(smsMessages.createdAt))
        .limit(1)
    )[0];
    const recent = lastOut && all.find((t) => t.id === lastOut.tenantId);
    if (recent) return recent;
    const client = await clientByPhone(fromDigits);
    const own = client && all.find((t) => t.id === client.tenantId);
    if (own) return own;
  }
  return all[0] ?? null;
}

/** A text arrived (Twilio webhook, app/api/twilio/sms). */
export async function receiveInbound(input: { from: string; to: string; body: string; sid?: string | null }) {
  const tenant = await tenantForInbound(input.to, input.from);
  if (!tenant) return null;
  const digits = phoneDigits(input.from);
  const client = digits ? await clientByPhone(digits, tenant.id) : undefined;
  const word = input.body.trim().toUpperCase();
  // Carrier keywords count whoever sends them; a client's choice is also recorded.
  const consent: 'STOP' | 'START' | null = STOP_WORDS.includes(word) ? 'STOP' : START_WORDS.includes(word) ? 'START' : null;
  if (client && consent) {
    await db.update(users).set({ smsConsent: consent === 'START', smsConsentAt: new Date() }).where(eq(users.id, client.id));
  }
  const id = crypto.randomUUID();
  await db.insert(smsMessages).values({
    id,
    tenantId: tenant.id,
    clientId: client?.id ?? null,
    direction: 'IN',
    fromNumber: toE164(input.from) ?? input.from,
    toNumber: toE164(input.to) ?? input.to,
    body: input.body,
    twilioSid: input.sid ?? null,
  });
  await db.insert(notificationLog).values({
    id: crypto.randomUUID(),
    tenantId: tenant.id,
    channel: 'SMS',
    recipient: 'admin',
    triggerEvent: `SMS_RECEIVED: ${client?.name ?? input.from}: ${redactPin(input.body).slice(0, 120)}`,
    isRead: false,
  });
  return { tenant, client: client ?? null, messageId: id, consent };
}

export type Thread = {
  key: string;
  phone: string;
  clientId: string | null;
  clientName: string | null;
  last: { body: string; direction: 'IN' | 'OUT'; at: string; byTex: boolean };
  unread: number;
};

/** Newest conversation first. */
export async function listThreads(tenantId: string): Promise<Thread[]> {
  const rows = await db.select().from(smsMessages).where(eq(smsMessages.tenantId, tenantId)).orderBy(desc(smsMessages.createdAt)).limit(2000);
  const threads = new Map<string, Thread>();
  for (const m of rows) {
    const other = m.direction === 'IN' ? m.fromNumber : m.toNumber;
    const key = phoneDigits(other) ?? other;
    let t = threads.get(key);
    if (!t) {
      t = {
        key,
        phone: other,
        clientId: m.clientId,
        clientName: null,
        last: { body: m.body, direction: m.direction, at: m.createdAt.toISOString(), byTex: m.sentByTex },
        unread: 0,
      };
      threads.set(key, t);
    }
    if (!t.clientId && m.clientId) t.clientId = m.clientId;
    if (m.direction === 'IN' && !m.readAt) t.unread += 1;
  }
  const list = Array.from(threads.values());
  const ids = [...new Set(list.map((t) => t.clientId).filter(Boolean))] as string[];
  if (ids.length) {
    const people = await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ids));
    for (const t of list) t.clientName = people.find((p) => p.id === t.clientId)?.name ?? null;
  }
  return list;
}

/** One conversation, oldest first; opening it marks incoming texts read. */
export async function getThread(tenantId: string, key: string) {
  const rows = await db
    .select()
    .from(smsMessages)
    .where(
      and(
        eq(smsMessages.tenantId, tenantId),
        sql`(right(regexp_replace(${smsMessages.fromNumber}, '\\D', '', 'g'), 10) = ${key} or right(regexp_replace(${smsMessages.toNumber}, '\\D', '', 'g'), 10) = ${key})`,
      ),
    )
    .orderBy(asc(smsMessages.createdAt));
  const unread = rows.filter((m) => m.direction === 'IN' && !m.readAt).map((m) => m.id);
  if (unread.length) await db.update(smsMessages).set({ readAt: new Date() }).where(inArray(smsMessages.id, unread));
  return rows;
}

export async function unreadTexts(tenantId: string) {
  const r = await db
    .select({ n: sql<number>`count(*)` })
    .from(smsMessages)
    .where(and(eq(smsMessages.tenantId, tenantId), eq(smsMessages.direction, 'IN'), isNull(smsMessages.readAt)));
  return Number(r[0]?.n ?? 0);
}
