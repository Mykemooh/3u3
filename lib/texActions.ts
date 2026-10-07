import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { translator } from '@/lib/i18n';
import { notifyMessages } from '@/lib/i18n/messages/notify';
import { z } from 'zod';
import { db } from '@/db/client';
import { addresses, bookings, serviceTypes, texActions, texMessages, users } from '@/db/schema';
import { and, desc, eq, gt, gte, lt, sql } from 'drizzle-orm';
import { rescheduleBookingByClient, cancelBookingByClient, logNotification, BookingLockedError, DoubleBookingError, BookingNotFoundError } from '@/lib/bookings';
import { combinedSlots } from '@/lib/capacity';
import { checkStandbyForFreedDate } from '@/lib/standby';
import { sendText, MessagingError } from '@/lib/messaging';
import { sendEmail, clientAccountChangeOwnerEmail } from '@/lib/email';
import { getOwnerEmail } from '@/lib/data';
import { appUrl } from '@/lib/url';
import { logChange } from '@/lib/audit';
import { formatDateLabel, formatSlotLabel } from '@/lib/scheduling';
import { businessLocalToUtc, businessTodayDate } from '@/lib/time';
import type { TexContext } from '@/lib/texTools';
import { pinVerified } from '@/lib/phonePin';

/**
 * Changes Tex makes for a client: move a clean, cancel one, or update
 * their account. Always two steps — Tex proposes the exact change and the
 * client confirms it — so nothing changes on a misunderstanding.
 *
 * Who is asking matters as much as what:
 * - Signed in on the website: their session proves it; they confirm with
 *   a plain yes.
 * - By text or phone: the number alone can be faked, so a one-time code is
 *   texted to the number on file and must be given back. Someone spoofing
 *   a client's number never sees the code.
 * The same 24-hour rule and availability checks as the client's own
 * account apply, and the owner gets the same "client updated their
 * account" email.
 */

const CODE_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const VERIFIED_MINUTES = 30;

export class TexActionError extends Error {}

export const hashCode = (id: string, code: string) => createHmac('sha256', process.env.NEXTAUTH_SECRET || 'dev-secret').update(`tex:${id}:${code}`).digest('hex');
export const needsCode = (ctx: Pick<TexContext, 'channel'>) => ctx.channel !== 'WEB';

/**
 * Does this change need a texted code? Not on the website (the session
 * proves who it is). By text or phone, a client who gave their PIN has
 * proved it, so a spoken yes is enough — except for an email change (a
 * way into the account), which always needs the code.
 */
async function codeRequired(ctx: TexContext, always: boolean) {
  if (!needsCode(ctx)) return false;
  if (always) return true;
  return !(await pinVerified(ctx));
}

/** Has the person on this call/text thread proved who they are recently? (Web sessions always have.) */
export async function isVerified(ctx: Pick<TexContext, 'channel' | 'tenant' | 'conversationId' | 'userId'>) {
  if (!needsCode(ctx)) return !!ctx.userId;
  if (!ctx.userId) return false;
  const since = new Date(Date.now() - VERIFIED_MINUTES * 60_000);
  const row = (
    await db
      .select({ id: texActions.id })
      .from(texActions)
      .where(and(eq(texActions.tenantId, ctx.tenant.id), eq(texActions.conversationId, ctx.conversationId), eq(texActions.userId, ctx.userId), eq(texActions.status, 'DONE'), gte(texActions.doneAt, since)))
      .limit(1)
  )[0];
  return !!row;
}

async function sendCode(ctx: TexContext, id: string, purpose: string) {
  const user = (await db.select().from(users).where(eq(users.id, ctx.userId!)).limit(1))[0];
  if (!user?.phone) throw new TexActionError('There’s no mobile number on this account to send a code to.');
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await db.update(texActions).set({ codeHash: hashCode(id, code) }).where(eq(texActions.id, id));
  try {
    await sendText({
      tenantId: ctx.tenant.id,
      clientId: user.id,
      body: translator(notifyMessages, user.locale === 'es' ? 'es' : 'en')('texCode', { company: ctx.tenant.name, code, purpose, minutes: CODE_MINUTES }),
      byTex: true,
    });
  } catch (err) {
    if (err instanceof MessagingError) throw new TexActionError('I couldn’t send a code to the number on file, so I can’t make changes this way. Please sign in to your account, or I can pass this to the team.');
    throw err;
  }
}

async function propose(ctx: TexContext, kind: 'RESCHEDULE' | 'CANCEL' | 'UPDATE_ACCOUNT' | 'VERIFY', summary: string, payload: unknown) {
  if (!ctx.userId) throw new TexActionError('Only a signed-in or identified client can do that.');
  // A newer proposal replaces any older one still waiting in this conversation.
  await db
    .update(texActions)
    .set({ status: 'CANCELLED' })
    .where(and(eq(texActions.tenantId, ctx.tenant.id), eq(texActions.conversationId, ctx.conversationId), eq(texActions.status, 'PENDING')));
  const id = crypto.randomUUID();
  await db.insert(texActions).values({
    id,
    tenantId: ctx.tenant.id,
    conversationId: ctx.conversationId,
    userId: ctx.userId,
    kind,
    payloadJson: JSON.stringify(payload),
    summary,
    expiresAt: new Date(Date.now() + CODE_MINUTES * 60_000),
  });
  const alwaysCode = kind === 'VERIFY' || (kind === 'UPDATE_ACCOUNT' && (payload as { field?: string }).field === 'email');
  if (await codeRequired(ctx, alwaysCode)) {
    await sendCode(ctx, id, summary);
    return {
      pending_id: id,
      summary,
      next: 'A 6-digit code was just texted to the number on file. Ask the person to give you that code, then call confirm_change with it. Do not say the change is done yet.',
    };
  }
  return { pending_id: id, summary, next: 'Read the summary back and ask the person to confirm. Only after a clear yes, call confirm_change. Do not say the change is done yet.' };
}

async function ownUpcoming(ctx: TexContext, bookingId: string) {
  const b = (await db.select().from(bookings).where(and(eq(bookings.id, bookingId), eq(bookings.clientId, ctx.userId ?? ''), eq(bookings.tenantId, ctx.tenant.id))).limit(1))[0];
  if (!b || b.isQuoteVisit) throw new TexActionError('That clean wasn’t found on this account.');
  if (b.status === 'CANCELLED' || b.status === 'COMPLETED') throw new TexActionError('That clean is already finished or cancelled.');
  if ((businessLocalToUtc(b.slotStart).getTime() - Date.now()) / 3600_000 < 24) {
    throw new TexActionError('That clean is less than 24 hours away, so the office has to change it. Offer to hand off to the team.');
  }
  return b;
}

/** Open times for a client's clean, at least 24 hours out. */
export async function openTimes(ctx: TexContext, bookingId: string, from?: string, to?: string) {
  const b = await ownUpcoming(ctx, bookingId);
  const service = b.serviceTypeId ? (await db.select().from(serviceTypes).where(eq(serviceTypes.id, b.serviceTypeId)).limit(1))[0] : undefined;
  const minutes = service?.defaultDurationMinutes ?? 150;
  const days = await combinedSlots(ctx.tenant.id, minutes, 45, businessTodayDate());
  const earliest = Date.now() + 24 * 3600_000;
  const out: { slot_start: string; slot_end: string; label: string }[] = [];
  for (const d of days) {
    if (from && d.date < from) continue;
    if (to && d.date > to) continue;
    for (const s of d.slots) {
      if (!s.available || businessLocalToUtc(s.start).getTime() < earliest) continue;
      out.push({ slot_start: s.start, slot_end: s.end, label: `${formatDateLabel(d.date)}, ${formatSlotLabel(s.start, s.end)}` });
      if (out.length >= 12) break;
    }
    if (out.length >= 12) break;
  }
  return { current: `${formatDateLabel(b.slotStart.slice(0, 10))}, ${formatSlotLabel(b.slotStart, b.slotEnd)}`, open_times: out };
}

export async function proposeReschedule(ctx: TexContext, bookingId: string, slotStart: string, slotEnd: string) {
  const b = await ownUpcoming(ctx, bookingId);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(slotStart) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(slotEnd)) throw new TexActionError('Pick one of the open times from find_open_times.');
  const { open_times } = await openTimes(ctx, bookingId, slotStart.slice(0, 10), slotStart.slice(0, 10));
  if (!open_times.some((t) => t.slot_start === slotStart && t.slot_end === slotEnd)) throw new TexActionError('That time isn’t open. Offer times from find_open_times.');
  const summary = `move the clean on ${formatDateLabel(b.slotStart.slice(0, 10))} (${formatSlotLabel(b.slotStart, b.slotEnd)}) to ${formatDateLabel(slotStart.slice(0, 10))}, ${formatSlotLabel(slotStart, slotEnd)}`;
  return propose(ctx, 'RESCHEDULE', summary, { bookingId, slotStart, slotEnd });
}

export async function proposeCancel(ctx: TexContext, bookingId: string) {
  const b = await ownUpcoming(ctx, bookingId);
  const summary = `cancel the clean on ${formatDateLabel(b.slotStart.slice(0, 10))}, ${formatSlotLabel(b.slotStart, b.slotEnd)}`;
  return propose(ctx, 'CANCEL', summary, { bookingId });
}

export const ACCOUNT_FIELDS = {
  email: 'email address',
  name: 'name on the account',
  reminders_by: 'how reminders are sent (EMAIL, SMS or WHATSAPP)',
  home_notes: 'notes for the crew about the home',
  pets: 'pets',
  parking: 'parking instructions',
  do_not_touch: 'things the crew should not touch',
} as const;
export type AccountField = keyof typeof ACCOUNT_FIELDS;

const fieldValue = z.object({ field: z.enum(Object.keys(ACCOUNT_FIELDS) as [AccountField, ...AccountField[]]), value: z.string().trim().max(500) });

export async function proposeAccountUpdate(ctx: TexContext, field: string, value: string) {
  const parsed = fieldValue.safeParse({ field, value });
  if (!parsed.success) throw new TexActionError(`I can update: ${Object.values(ACCOUNT_FIELDS).join(', ')}. Phone numbers, addresses, entry codes and payment cards are changed in the account or by the office.`);
  const v = parsed.data.value;
  if (parsed.data.field === 'email') {
    if (!z.string().email().safeParse(v).success) throw new TexActionError('That doesn’t look like an email address.');
    const taken = (await db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${v.toLowerCase()}`).limit(1))[0];
    if (taken && taken.id !== ctx.userId) throw new TexActionError('That email is already used by another account.');
  }
  if (parsed.data.field === 'name' && v.length < 2) throw new TexActionError('That name is too short.');
  if (parsed.data.field === 'reminders_by' && !['EMAIL', 'SMS', 'WHATSAPP'].includes(v.toUpperCase())) throw new TexActionError('Reminders can go by EMAIL, SMS or WHATSAPP.');
  const shown = parsed.data.field === 'reminders_by' ? v.toUpperCase() : v || '(clear it)';
  return propose(ctx, 'UPDATE_ACCOUNT', `change the ${ACCOUNT_FIELDS[parsed.data.field]} to “${shown}”`, { field: parsed.data.field, value: v });
}

/** By phone: prove who's calling before Tex reads anything from the account. */
export async function proposeVerify(ctx: TexContext) {
  return propose(ctx, 'VERIFY', 'it’s you on this call', {});
}

async function tellOwner(ctx: TexContext, summary: string, bookingId?: string) {
  const client = (await db.select().from(users).where(eq(users.id, ctx.userId!)).limit(1))[0];
  await logNotification({
    tenantId: ctx.tenant.id,
    channel: 'EMAIL',
    recipient: client?.name ?? 'A client',
    triggerEvent: `CUSTOMER_BOOKING_CHANGE (via Tex, ${ctx.channel.toLowerCase()}): ${summary}`,
    relatedBookingId: bookingId,
  });
  const owner = await getOwnerEmail(ctx.tenant.id);
  if (owner && client) {
    const { subject, html } = clientAccountChangeOwnerEmail({ clientName: client.name, clientPhone: client.phone ?? undefined, summary: `Through Tex: ${summary}.`, manageUrl: appUrl(`/admin/clients/${client.id}`) });
    await sendEmail({ to: owner, subject, html }).catch(() => false);
  }
}

/** Second step: the person said yes (web) or gave back the code (text/phone). */
export async function confirmChange(ctx: TexContext, pendingId: string, code?: string) {
  if (!ctx.userId) throw new TexActionError('Only a signed-in or identified client can do that.');
  const row = (
    await db
      .select()
      .from(texActions)
      .where(and(eq(texActions.id, pendingId), eq(texActions.tenantId, ctx.tenant.id), eq(texActions.conversationId, ctx.conversationId), eq(texActions.userId, ctx.userId)))
      .limit(1)
  )[0];
  if (!row || row.status !== 'PENDING') throw new TexActionError('There’s nothing waiting to confirm — propose the change again.');
  if (row.expiresAt.getTime() < Date.now()) {
    await db.update(texActions).set({ status: 'EXPIRED' }).where(eq(texActions.id, row.id));
    throw new TexActionError('That confirmation expired — propose the change again.');
  }
  const rowPayload = JSON.parse(row.payloadJson ?? '{}');
  const codeNeeded = await codeRequired(ctx, row.kind === 'VERIFY' || (row.kind === 'UPDATE_ACCOUNT' && rowPayload.field === 'email'));
  if (!codeNeeded) {
    // A plain yes must come from the person in a LATER message than the proposal, never in the same turn.
    const said = (
      await db
        .select({ id: texMessages.id })
        .from(texMessages)
        .where(and(eq(texMessages.tenantId, ctx.tenant.id), eq(texMessages.conversationId, ctx.conversationId), eq(texMessages.author, 'USER'), gt(texMessages.createdAt, row.createdAt)))
        .limit(1)
    )[0];
    if (!said) throw new TexActionError('The person hasn’t said yes yet. Read the summary back and wait for their reply before confirming.');
  }
  if (codeNeeded) {
    const used = await db
      .update(texActions)
      .set({ attempts: sql`${texActions.attempts} + 1` })
      .where(and(eq(texActions.id, row.id), lt(texActions.attempts, MAX_ATTEMPTS)))
      .returning({ attempts: texActions.attempts });
    if (!used.length) {
      await db.update(texActions).set({ status: 'FAILED' }).where(eq(texActions.id, row.id));
      throw new TexActionError('Too many wrong codes. For safety this change is cancelled — offer to hand off to the team.');
    }
    const given = (code ?? '').replace(/\D/g, '');
    const want = Buffer.from(row.codeHash ?? '');
    const got = Buffer.from(hashCode(row.id, given));
    if (!row.codeHash || want.length !== got.length || !timingSafeEqual(want, got)) throw new TexActionError('That code isn’t right. Ask them to check the text and try again.');
  }

  // Claim it, so a double-send can't apply it twice.
  const claimed = await db.update(texActions).set({ status: 'DONE', doneAt: new Date() }).where(and(eq(texActions.id, row.id), eq(texActions.status, 'PENDING'))).returning({ id: texActions.id });
  if (!claimed.length) throw new TexActionError('That change was already handled.');
  const payload = JSON.parse(row.payloadJson ?? '{}');

  try {
    if (row.kind === 'VERIFY') return { done: true, result: 'Verified. You can now look at and change this client’s account for the rest of the call.' };
    if (row.kind === 'RESCHEDULE') {
      const before = (await db.select().from(bookings).where(eq(bookings.id, payload.bookingId)).limit(1))[0];
      await rescheduleBookingByClient({ bookingId: payload.bookingId, clientId: ctx.userId, slotStart: payload.slotStart, slotEnd: payload.slotEnd });
      if (before && before.slotStart.slice(0, 10) !== String(payload.slotStart).slice(0, 10)) await checkStandbyForFreedDate(ctx.tenant.id, before.slotStart.slice(0, 10));
      await tellOwner(ctx, row.summary, payload.bookingId);
      return { done: true, result: `Done — ${row.summary.replace(/^move/, 'moved')}.` };
    }
    if (row.kind === 'CANCEL') {
      const before = (await db.select().from(bookings).where(eq(bookings.id, payload.bookingId)).limit(1))[0];
      await cancelBookingByClient({ bookingId: payload.bookingId, clientId: ctx.userId });
      if (before) await checkStandbyForFreedDate(ctx.tenant.id, before.slotStart.slice(0, 10));
      await tellOwner(ctx, row.summary, payload.bookingId);
      return { done: true, result: `Done — ${row.summary.replace(/^cancel/, 'cancelled')}.` };
    }
    // UPDATE_ACCOUNT
    const field = payload.field as AccountField;
    const value = String(payload.value ?? '');
    const user = (await db.select().from(users).where(eq(users.id, ctx.userId)).limit(1))[0]!;
    if (field === 'email') await db.update(users).set({ email: value.toLowerCase() }).where(eq(users.id, user.id));
    else if (field === 'name') await db.update(users).set({ name: value }).where(eq(users.id, user.id));
    else if (field === 'reminders_by') await db.update(users).set({ notificationChannel: value.toUpperCase() as 'EMAIL' | 'SMS' | 'WHATSAPP' }).where(eq(users.id, user.id));
    else {
      const addr = (await db.select().from(addresses).where(and(eq(addresses.userId, user.id), eq(addresses.isPrimary, true))).limit(1))[0] ?? (await db.select().from(addresses).where(eq(addresses.userId, user.id)).limit(1))[0];
      if (!addr) throw new TexActionError('There’s no home on this account yet.');
      const column = { home_notes: 'notes', pets: 'pets', parking: 'parkingNotes', do_not_touch: 'doNotTouch' }[field as 'home_notes' | 'pets' | 'parking' | 'do_not_touch'];
      await db.update(addresses).set({ [column]: value || null }).where(eq(addresses.id, addr.id));
    }
    await logChange({ tenantId: ctx.tenant.id, actor: { id: user.id, name: `${user.name} (via Tex)` }, entityType: 'client', entityId: user.id, action: 'updated', summary: row.summary });
    await tellOwner(ctx, row.summary);
    return { done: true, result: `Done — ${row.summary.replace(/^change/, 'changed')}.` };
  } catch (err) {
    await db.update(texActions).set({ status: 'FAILED' }).where(eq(texActions.id, row.id));
    if (err instanceof BookingLockedError || err instanceof BookingNotFoundError) throw new TexActionError(err.message);
    if (err instanceof DoubleBookingError) throw new TexActionError('That time was just taken. Find another open time.');
    if (err instanceof TexActionError) throw err;
    console.error('[tex] action failed', err);
    throw new TexActionError('That didn’t go through. Offer to pass it to the team.');
  }
}

export async function pendingFor(ctx: Pick<TexContext, 'tenant' | 'conversationId'>) {
  return (
    await db
      .select()
      .from(texActions)
      .where(and(eq(texActions.tenantId, ctx.tenant.id), eq(texActions.conversationId, ctx.conversationId), eq(texActions.status, 'PENDING')))
      .orderBy(desc(texActions.createdAt))
      .limit(1)
  )[0];
}
