import { eq, and, isNull, or } from 'drizzle-orm';
import { automationStates, sendAutomationMessage, whenLabel, type AutomationState, type AutomationKey } from '@/lib/automations';
import { db } from '@/db/client';
import { bookings, users, serviceTypes, quotes, tenants } from '@/db/schema';
import { businessLocalToUtc, formatSlot } from '@/lib/time';
import { formatDateLabel, formatSlotLabel } from '@/lib/scheduling';
import { estimateUrl } from '@/lib/estimates';
import { appUrl } from '@/lib/url';
import { notifyClient } from '@/lib/notify';
import { bookingReminderEmail, bookingReminderText, estimateReminderEmail, estimateReminderText } from '@/lib/email';
import { SERVICE_LABELS, formatMoney } from '@/lib/data';

/**
 * Two independent reminder sweeps, both meant to be run by a daily cron
 * (app/api/cron/reminders/route.ts). Each booking/quote only ever gets a
 * given reminder once — the *_SentAt / reminderCount columns this checks
 * and sets make every run idempotent, so running the cron more than once
 * a day (or retrying after a failure) never double-sends.
 */

const HOUR = 60 * 60 * 1000;

/** Each company's reminder settings, loaded once per cron run. */
async function settingsCache() {
  const cache = new Map<string, { name: string; states: Record<AutomationKey, AutomationState> }>();
  return async (tenantId: string) => {
    let hit = cache.get(tenantId);
    if (!hit) {
      const tenant = (await db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, tenantId)).limit(1))[0];
      hit = { name: tenant?.name ?? 'Your cleaning company', states: await automationStates(tenantId) };
      cache.set(tenantId, hit);
    }
    return hit;
  };
}

/**
 * Upcoming-cleaning reminders — by default 3 days out, then 36 hours out.
 * Both are toggles with an editable "how long before" and wording
 * (Settings → Reminders & follow-ups, lib/automations.ts). The column
 * names keep their original 3d/36h meaning: "first reminder sent" and
 * "second reminder sent".
 */
export async function sendBookingReminders(): Promise<{ sent3d: number; sent36h: number }> {
  const now = Date.now();
  const settings = await settingsCache();
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

    const { name: tenantName, states } = await settings(booking.tenantId);
    const first = states.visit_reminder_first;
    const second = states.visit_reminder_second;
    const firstHours = (first.offsetMinutes ?? 72 * 60) / 60;
    const secondHours = (second.offsetMinutes ?? 36 * 60) / 60;
    const due3d = first.enabled && !booking.reminder3dSentAt && hoursUntil <= firstHours;
    const due36h = second.enabled && !booking.reminder36hSentAt && hoursUntil <= secondHours;
    if (!due3d && !due36h) continue;

    const client = (await db.select().from(users).where(eq(users.id, booking.clientId)).limit(1))[0];
    if (!client) continue;
    const service = booking.serviceTypeId
      ? (await db.select().from(serviceTypes).where(eq(serviceTypes.id, booking.serviceTypeId)).limit(1))[0]
      : undefined;
    const serviceName = service ? SERVICE_LABELS[service.key as keyof typeof SERVICE_LABELS] ?? service.name : 'Cleaning';
    const [dateLabel, timeLabel] = [formatDateLabel(booking.slotStart.slice(0, 10)), formatSlotLabel(booking.slotStart, booking.slotEnd)];

    const send = async (key: 'visit_reminder_first' | 'visit_reminder_second', state: AutomationState, hours: number, event: string) => {
      const horizon = whenLabel(Math.round(hours)).replace(/^in /, '');
      if (state.customized) {
        const link = appUrl('/account');
        await sendAutomationMessage({
          tenantId: booking.tenantId,
          tenantName,
          key,
          state,
          client,
          vars: { service: serviceName, date: dateLabel, time: timeLabel, when: whenLabel(Math.round(hours)), link },
          cta: { label: 'Open my account', url: link },
          relatedBookingId: booking.id,
        });
      } else {
        await notifyClient({
          tenantId: booking.tenantId,
          client,
          triggerEvent: event,
          relatedBookingId: booking.id,
          email: bookingReminderEmail({ name: client.name, serviceName, dateLabel, timeLabel, horizon }),
          text: bookingReminderText({ serviceName, dateLabel, timeLabel, horizon }),
        });
      }
    };

    // Each reminder is claimed with a conditional update before it is
    // sent, so two runs at once (or a retried cron) can't both send it.
    let sentFirst = false;
    if (due3d) {
      const claimed = await db
        .update(bookings)
        .set({ reminder3dSentAt: new Date() })
        .where(and(eq(bookings.id, booking.id), isNull(bookings.reminder3dSentAt)))
        .returning({ id: bookings.id });
      if (claimed.length) {
        await send('visit_reminder_first', first, firstHours, 'BOOKING_REMINDER_3D');
        sent3d += 1;
        sentFirst = true;
      }
    }
    if (due36h) {
      const claimed = await db
        .update(bookings)
        .set({ reminder36hSentAt: new Date() })
        .where(and(eq(bookings.id, booking.id), isNull(bookings.reminder36hSentAt)))
        .returning({ id: bookings.id });
      // Both due in the same run (booked at short notice): one message is enough.
      if (claimed.length) {
        if (!sentFirst) await send('visit_reminder_second', second, secondHours, 'BOOKING_REMINDER_36H');
        sent36h += 1;
      }
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
  const settings = await settingsCache();
  const rows = await db
    .select()
    .from(quotes)
    .where(and(eq(quotes.status, 'SENT'), eq(quotes.remindersOptedOut, false)));

  let sent = 0;

  for (const quote of rows) {
    if (quote.expiresAt && quote.expiresAt.getTime() < now) continue; // the daily expiry sweep (respondToEstimate) will catch this
    if (!quote.sentAt) continue;
    const { name: tenantName, states } = await settings(quote.tenantId);
    const followup = states.quote_followup;
    if (!followup.enabled) continue;

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

    const claimed = await db
      .update(quotes)
      .set({ reminderCount: quote.reminderCount + 1, lastReminderAt: new Date() })
      .where(and(eq(quotes.id, quote.id), eq(quotes.reminderCount, quote.reminderCount)))
      .returning({ id: quotes.id });
    if (!claimed.length) continue; // another run already sent this step

    if (followup.customized) {
      await sendAutomationMessage({
        tenantId: quote.tenantId,
        tenantName,
        key: 'quote_followup',
        state: followup,
        client,
        vars: { service: serviceName, amount: formatMoney(quote.totalCents), link: url },
        cta: { label: 'View and approve', url },
        relatedBookingId: quote.quoteVisitBookingId ?? undefined,
        footerNote: `Not interested? Stop these reminders: ${optOutUrl}`,
      });
    } else {
      await notifyClient({
        tenantId: quote.tenantId,
        client,
        triggerEvent: 'ESTIMATE_REMINDER',
        relatedBookingId: quote.quoteVisitBookingId ?? undefined,
        email: estimateReminderEmail({ name: client.name, serviceName, totalCents: quote.totalCents, url, optOutUrl }),
        text: estimateReminderText({ serviceName, totalCents: quote.totalCents, url }),
      });
    }
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
