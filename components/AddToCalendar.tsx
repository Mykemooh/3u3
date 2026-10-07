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
export default function AddToCalendar({
  bookingId,
  event,
  compact = false,
}: {
  bookingId: string;
  event: CalendarEvent;
  /** Icon-only, for a row in a list of cleanings (the label stays as its accessible name). */
  compact?: boolean;
}) {
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
        aria-label={compact ? t('calAdd') : undefined}
        title={compact ? t('calAdd') : undefined}
        className={compact ? 'flex h-11 w-11 items-center justify-center rounded-full border border-line bg-white text-bronze transition-colors hover:border-gold' : 'btn-secondary btn-sm min-h-[44px] whitespace-nowrap'}
      >
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M16 3v4M8 3v4M3 10h18M12 13.5v5M9.5 16h5" />
        </svg>
        {!compact && t('calAdd')}
      </button>
      {open && (
        <ul id={menuId} role="menu" className="absolute right-0 z-30 mt-1 w-60 overflow-hidden rounded-xl border border-line bg-white p-1 shadow-card-lg">
          <li>
            <a href={googleCalendarUrl(event)} target="_blank" rel="noreferrer" className="flex min-h-[44px] items-center rounded-lg px-3 text-[15px] text-ink hover:bg-surface">
              Google Calendar
            </a>
          </li>
          <li>
            <a href={outlookCalendarUrl(event)} target="_blank" rel="noreferrer" className="flex min-h-[44px] items-center rounded-lg px-3 text-[15px] text-ink hover:bg-surface">
              Outlook.com
            </a>
          </li>
          <li>
            <a href={icsHref} className="flex min-h-[44px] items-center rounded-lg px-3 text-[15px] text-ink hover:bg-surface">
              {t('calOther')}
            </a>
          </li>
        </ul>
      )}
    </div>
  );
}
