import { eq, and, isNull, or } from 'drizzle-orm';
import { db } from '@/db/client';
import { bookings, users, serviceTypes, quotes } from '@/db/schema';
import { businessLocalToUtc, formatSlot } from '@/lib/time';
import { formatDateLabel, formatSlotLabel } from '@/lib/scheduling';
import { estimateUrl } from '@/lib/estimates';
import { appUrl } from '@/lib/url';
import { notifyClient } from '@/lib/notify';
import { bookingReminderEmail, bookingReminderText, estimateReminderEmail, estimateReminderText } from '@/lib/email';
import { SERVICE_LABELS } from '@/lib/data';

/**
 * Two independent reminder sweeps, both meant to be run by a daily cron
 * (app/api/cron/reminders/route.ts). Each booking/quote only ever gets a
 * given reminder once — the *_SentAt / reminderCount columns this checks
 * and sets make every run idempotent, so running the cron more than once
 * a day (or retrying after a failure) never double-sends.
 */

const HOUR = 60 * 60 * 1000;

/** Upcoming-cleaning reminders: 3 days out, then 36 hours out. */
export async function sendBookingReminders(): Promise<{ sent3d: number; sent36h: number }> {
  const now = Date.now();
  const rows = await db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.status, 'CONFIRMED'),
        eq(bookings.isQuoteVisit, false),
        or(isNull(bookings.reminder3dSentAt), isNull(bookings.reminder36hSentAt)),
      ),
    );

  let sent3d = 0;
  let sent36h = 0;

  for (const booking of rows) {
    const hoursUntil = (businessLocalToUtc(booking.slotStart).getTime() - now) / HOUR;
    if (hoursUntil <= 0) continue; // already happened or happening

    const due3d = !booking.reminder3dSentAt && hoursUntil <= 72;
    const due36h = !booking.reminder36hSentAt && hoursUntil <= 36;
    if (!due3d && !due36h) continue;

    const client = (await db.select().from(users).where(eq(users.id, booking.clientId)).limit(1))[0];
    if (!client) continue;
    const service = booking.serviceTypeId
      ? (await db.select().from(serviceTypes).where(eq(serviceTypes.id, booking.serviceTypeId)).limit(1))[0]
      : undefined;
    const serviceName = service ? SERVICE_LABELS[service.key as keyof typeof SERVICE_LABELS] ?? service.name : 'Cleaning';
    const [dateLabel, timeLabel] = [formatDateLabel(booking.slotStart.slice(0, 10)), formatSlotLabel(booking.slotStart, booking.slotEnd)];

    if (due3d) {
      await notifyClient({
        tenantId: booking.tenantId,
        client,
        triggerEvent: 'BOOKING_REMINDER_3D',
        relatedBookingId: booking.id,
        email: bookingReminderEmail({ name: client.name, serviceName, dateLabel, timeLabel, horizon: '3 days' }),
        text: bookingReminderText({ serviceName, dateLabel, timeLabel, horizon: '3 days' }),
      });
      await db.update(bookings).set({ reminder3dSentAt: new Date() }).where(eq(bookings.id, booking.id));
      sent3d += 1;
    }
    if (due36h) {
      await notifyClient({
        tenantId: booking.tenantId,
        client,
        triggerEvent: 'BOOKING_REMINDER_36H',
        relatedBookingId: booking.id,
        email: bookingReminderEmail({ name: client.name, serviceName, dateLabel, timeLabel, horizon: '36 hours' }),
        text: bookingReminderText({ serviceName, dateLabel, timeLabel, horizon: '36 hours' }),
      });
      await db.update(bookings).set({ reminder36hSentAt: new Date() }).where(eq(bookings.id, booking.id));
      sent36h += 1;
    }
  }

  return { sent3d, sent36h };
}

// Hours after `sentAt` (or after the previous reminder, once weekly) each
// step is due: 24h, then +3d (4d total), then +2d (6d total), then every
// 7 days forever.
const QUOTE_REMINDER_STEPS_HOURS = [24, 4 * 24, 6 * 24];
const QUOTE_WEEKLY_HOURS = 7 * 24;

/** Quote follow-up cadence for a SENT estimate nobody has answered yet. */
export async function sendQuoteReminders(): Promise<{ sent: number }> {
  const now = Date.now();
  const rows = await db
    .select()
    .from(quotes)
    .where(and(eq(quotes.status, 'SENT'), eq(quotes.remindersOptedOut, false)));

  let sent = 0;

  for (const quote of rows) {
    if (quote.expiresAt && quote.expiresAt.getTime() < now) continue; // the daily expiry sweep (respondToEstimate) will catch this
    if (!quote.sentAt) continue;

    const dueHours =
      quote.reminderCount < QUOTE_REMINDER_STEPS_HOURS.length
        ? QUOTE_REMINDER_STEPS_HOURS[quote.reminderCount]
        : null;
    const since = quote.reminderCount < QUOTE_REMINDER_STEPS_HOURS.length ? quote.sentAt : quote.lastReminderAt ?? quote.sentAt;
    const hoursSince = (now - since.getTime()) / HOUR;
    const threshold = dueHours ?? QUOTE_WEEKLY_HOURS;
    if (hoursSince < threshold) continue;

    const client = (await db.select().from(users).where(eq(users.id, quote.clientId)).limit(1))[0];
    if (!client) continue;
    const service = (await db.select().from(serviceTypes).where(eq(serviceTypes.id, quote.serviceTypeId)).limit(1))[0];
    const serviceName = service?.name ?? 'Cleaning service';
    const url = estimateUrl(quote.approvalToken ?? '');
    const optOutUrl = appUrl(`/api/estimates/${quote.approvalToken}/opt-out-reminders`);

    await notifyClient({
      tenantId: quote.tenantId,
      client,
      triggerEvent: 'ESTIMATE_REMINDER',
      relatedBookingId: quote.quoteVisitBookingId ?? undefined,
      email: estimateReminderEmail({ name: client.name, serviceName, totalCents: quote.totalCents, url, optOutUrl }),
      text: estimateReminderText({ serviceName, totalCents: quote.totalCents, url }),
    });
    await db
      .update(quotes)
      .set({ reminderCount: quote.reminderCount + 1, lastReminderAt: new Date() })
      .where(eq(quotes.id, quote.id));
    sent += 1;
  }

  return { sent };
}

/** The "stop these reminders" link every quote reminder carries. */
export async function optOutOfQuoteReminders(token: string): Promise<boolean> {
  const quote = (await db.select().from(quotes).where(eq(quotes.approvalToken, token)).limit(1))[0];
  if (!quote) return false;
  await db.update(quotes).set({ remindersOptedOut: true }).where(eq(quotes.id, quote.id));
  return true;
}
