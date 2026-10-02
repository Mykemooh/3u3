import { businessLocalToUtc } from '@/lib/time';

/**
 * "Add to calendar" for an upcoming cleaning — three free, no-API-key
 * options that cover every calendar a client is likely to use:
 *
 *  - Google Calendar: a URL template (calendar.google.com/calendar/render)
 *  - Outlook.com: a URL template (outlook.live.com's own "deeplink/compose")
 *  - Everything else (Apple Calendar, desktop Outlook, and Skylight, which
 *    documents importing/subscribing to standard .ics files): a plain
 *    .ics download, generated on the fly — see
 *    app/api/account/bookings/[id]/calendar.ics/route.ts.
 *
 * No OAuth, no paid calendar API, nothing to configure.
 */

function utcStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export type CalendarEvent = {
  uid: string;
  title: string;
  description: string;
  location?: string;
  slotStart: string; // naive business-local "YYYY-MM-DDTHH:MM:00"
  slotEnd: string;
};

export function googleCalendarUrl(ev: CalendarEvent): string {
  const start = businessLocalToUtc(ev.slotStart);
  const end = businessLocalToUtc(ev.slotEnd);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: ev.title,
    dates: `${utcStamp(start)}/${utcStamp(end)}`,
    details: ev.description,
    location: ev.location ?? '',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function outlookCalendarUrl(ev: CalendarEvent): string {
  const start = businessLocalToUtc(ev.slotStart);
  const end = businessLocalToUtc(ev.slotEnd);
  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: ev.title,
    body: ev.description,
    location: ev.location ?? '',
    startdt: start.toISOString(),
    enddt: end.toISOString(),
  });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}

/** Escapes text for an ICS field (RFC 5545 §3.3.11). */
function icsEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

/**
 * A standalone .ics file for one event. Apple Calendar, desktop/web
 * Outlook, and Skylight (via its "import a calendar file" / subscribe-by-
 * URL feature) all open this directly — no account linking needed.
 */
export function buildIcs(ev: CalendarEvent): string {
  const start = businessLocalToUtc(ev.slotStart);
  const end = businessLocalToUtc(ev.slotEnd);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//3U3 Cleaning//Booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${ev.uid}`,
    `DTSTAMP:${utcStamp(new Date())}`,
    `DTSTART:${utcStamp(start)}`,
    `DTEND:${utcStamp(end)}`,
    `SUMMARY:${icsEscape(ev.title)}`,
    `DESCRIPTION:${icsEscape(ev.description)}`,
    ...(ev.location ? [`LOCATION:${icsEscape(ev.location)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n');
}
