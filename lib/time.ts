import { intlLocale, type Locale } from '@/lib/i18n';
/**
 * Business-local time for 3U3 (Katy, TX).
 *
 * Booking slots are stored as naive wall-clock strings ("YYYY-MM-DDTHH:MM:00")
 * in the business's own timezone (see lib/scheduling.ts). The server,
 * though, runs in UTC on Vercel. Comparing a slot against
 * `new Date().toISOString()` therefore compares Katy time against London
 * time: after 7 PM Central every evening, "today" quietly became tomorrow,
 * today's jobs dropped off the crew's list, and anything scheduled in the
 * next five hours stopped counting as "upcoming".
 *
 * Everything that asks "what time is it for the business?" goes through
 * here instead, so it's answered in one place, in the right zone.
 */
export const BUSINESS_TIMEZONE = process.env.BUSINESS_TIMEZONE || 'America/Chicago';

function parts(date: Date) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const p: Record<string, string> = {};
  for (const { type, value } of fmt.formatToParts(date)) p[type] = value;
  return p;
}

/** Now, as a business-local wall-clock string comparable with slotStart. */
export function businessNowISO(date = new Date()): string {
  const p = parts(date);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}

/** Today's date in the business timezone, "YYYY-MM-DD". */
export function businessTodayISO(date = new Date()): string {
  return businessNowISO(date).slice(0, 10);
}

/**
 * A Date whose *local* calendar fields match the business's today — the
 * shape lib/scheduling.ts's day-iterators expect as their start date.
 */
export function businessTodayDate(date = new Date()): Date {
  const [y, m, d] = businessTodayISO(date).split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

/** "Thu, Sep 24 · 8:00 AM" from a naive slot string. */
export function formatSlot(slotStart: string, locale: Locale = 'en'): string {
  const [date, time] = slotStart.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const day = new Date(y, m - 1, d).toLocaleDateString(intlLocale(locale), { weekday: 'short', month: 'short', day: 'numeric' });
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${day} · ${h12}:${String(mm).padStart(2, '0')} ${hh >= 12 ? 'PM' : 'AM'}`;
}

/** "September 24, 2026" from a naive slot string. */
export function formatSlotDateLong(slotStart: string, locale: Locale = 'en'): string {
  const [y, m, d] = slotStart.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(intlLocale(locale), { month: 'long', day: 'numeric', year: 'numeric' });
}

/** A timestamp shown in business time, e.g. "8:04 AM". */
export function formatClock(date: Date | null | undefined, locale: Locale = 'en'): string {
  if (!date) return '';
  return date.toLocaleTimeString(intlLocale(locale), { timeZone: BUSINESS_TIMEZONE, hour: 'numeric', minute: '2-digit' });
}

/**
 * The real UTC instant a naive business-local slot string ("YYYY-MM-
 * DDTHH:MM:00") refers to — what a calendar invite (lib/calendar.ts) or a
 * "how many hours until this booking" check (lib/reminders.ts) needs,
 * since both have to agree with clocks outside the business's own
 * timezone. Standard two-pass zoned-to-UTC conversion: guess the instant
 * by treating the wall-clock numbers as UTC, see what that guess actually
 * reads as in the business timezone, and correct by the difference. Right
 * for every real date; off by at most an hour for a wall-clock time that
 * doesn't exist or exists twice on a DST-transition day, which 3U3's
 * booking hours never land on.
 */
export function businessLocalToUtc(naive: string): Date {
  const [datePart, timePart = '00:00:00'] = naive.split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh, mm, ss] = timePart.split(':').map((n) => Number(n) || 0);
  const guess = Date.UTC(y, m - 1, d, hh, mm, ss);
  const p = parts(new Date(guess));
  const asIfUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  return new Date(guess + (guess - asIfUtc));
}

/** Is the business open right now? days is "1,2,3" (0 = Sunday), from/to are "HH:MM" in business time. */
export function isOpenNow(days: string, from: string, to: string, date = new Date()): boolean {
  const iso = businessNowISO(date);
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const weekday = new Date(y, m - 1, d).getDay();
  if (!days.split(',').map((x) => x.trim()).includes(String(weekday))) return false;
  const now = iso.slice(11, 16);
  return now >= from && now < to;
}
