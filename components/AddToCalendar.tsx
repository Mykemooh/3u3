'use client';

import { useId, useState } from 'react';
import { useT } from '@/components/i18n/LocaleProvider';
import { accountMessages } from '@/lib/i18n/messages/account';
import { googleCalendarUrl, outlookCalendarUrl, type CalendarEvent } from '@/lib/calendar';

/**
 * "Add to calendar" for one upcoming cleaning. Google and Outlook.com get
 * direct links; everything else (Apple Calendar, desktop Outlook, and
 * Skylight, which supports importing a standard calendar file) downloads
 * an .ics from our own API — see app/api/account/bookings/[id]/calendar.
 */
export default function AddToCalendar({ bookingId, event }: { bookingId: string; event: CalendarEvent }) {
  const t = useT(accountMessages);
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const icsHref = `/api/account/bookings/${bookingId}/calendar`;

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        aria-expanded={open}
        aria-controls={menuId}
        className="btn-secondary btn-sm"
      >
        {t('calAdd')}
      </button>
      {open && (
        <ul id={menuId} role="menu" className="absolute right-0 z-30 mt-1 w-56 overflow-hidden rounded-xl border border-line bg-white shadow-card-lg">
          <li>
            <a href={googleCalendarUrl(event)} target="_blank" rel="noreferrer" className="block px-4 py-2.5 text-sm text-ink hover:bg-surface">
              Google Calendar
            </a>
          </li>
          <li>
            <a href={outlookCalendarUrl(event)} target="_blank" rel="noreferrer" className="block px-4 py-2.5 text-sm text-ink hover:bg-surface">
              Outlook.com
            </a>
          </li>
          <li>
            <a href={icsHref} className="block px-4 py-2.5 text-sm text-ink hover:bg-surface">
              {t('calOther')}
            </a>
          </li>
        </ul>
      )}
    </div>
  );
}
