'use client';

import { useMemo, useState } from 'react';
import { useLocale, useT } from '@/components/i18n/LocaleProvider';
import { intlLocale, type Locale } from '@/lib/i18n';
import { formsMessages } from '@/lib/i18n/messages/forms';

export type CalendarDay = { date: string; hasAvailability: boolean };

/** One-letter weekday headings, Sunday first (S M T W T F S / D L M M J V S). */
function weekdayLabels(locale: Locale): string[] {
  const fmt = new Intl.DateTimeFormat(intlLocale(locale), { weekday: 'narrow' });
  // 2026-01-04 was a Sunday.
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2026, 0, 4 + i)));
}
/** "October 2026" / "Octubre de 2026" (Spanish month names are lowercase mid-sentence; this is a heading). */
function monthHeading(d: Date, locale: Locale): string {
  const s = d.toLocaleDateString(intlLocale(locale), { month: 'long', year: 'numeric' });
  return locale === 'es' ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

const MONTHS_AHEAD_MAX = 11; // this month plus 11 more = a year out

function monthKey(y: number, m: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}`;
}

/**
 * A real month-grid calendar (not a scrollable list) for picking a
 * cleaning day, navigable up to a year out. Days with at least one open
 * slot are highlighted; everything else renders but is unclickable, same
 * "show real capacity, don't just hide it" philosophy as the slot buttons
 * themselves (lib/scheduling.ts never lies about availability).
 */
export default function BookingCalendar({
  availability,
  selectedDate,
  onSelectDate,
}: {
  availability: Map<string, boolean>;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
}) {
  const t = useT(formsMessages);
  const locale = useLocale();
  const weekdays = useMemo(() => weekdayLabels(locale), [locale]);
  const today = useMemo(() => new Date(), []);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const todayKey = monthKey(today.getFullYear(), today.getMonth());
  const viewKey = monthKey(viewYear, viewMonth);
  const maxDate = new Date(today.getFullYear(), today.getMonth() + MONTHS_AHEAD_MAX, 1);
  const maxKey = monthKey(maxDate.getFullYear(), maxDate.getMonth());
  const atMin = viewKey <= todayKey;
  const atMax = viewKey >= maxKey;

  function shiftMonth(delta: number) {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  }

  const cells = useMemo(() => {
    const firstOfMonth = new Date(viewYear, viewMonth, 1);
    const startWeekday = firstOfMonth.getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const todayISO = today.toISOString().slice(0, 10);
    const out: { date: string | null; dayNum: number | null; isToday: boolean; available: boolean }[] = [];
    for (let i = 0; i < startWeekday; i += 1) out.push({ date: null, dayNum: null, isToday: false, available: false });
    for (let d = 1; d <= daysInMonth; d += 1) {
      const date = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      out.push({ date, dayNum: d, isToday: date === todayISO, available: !!availability.get(date) && date >= todayISO });
    }
    return out;
  }, [viewYear, viewMonth, availability, today]);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          disabled={atMin}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-line text-ink transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-30"
          aria-label={t('prevMonth')}
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg>
        </button>
        <p className="ct-h3">
          {monthHeading(new Date(viewYear, viewMonth, 1), locale)}
        </p>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          disabled={atMax}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-line text-ink transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-30"
          aria-label={t('nextMonth')}
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[13px] font-semibold text-muted">
        {weekdays.map((d, i) => (
          <div key={i} className="py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell, i) =>
          cell.date ? (
            <button
              key={cell.date}
              type="button"
              disabled={!cell.available}
              onClick={() => onSelectDate(cell.date!)}
              className={`money relative aspect-square min-h-[40px] rounded-xl sm:aspect-auto sm:h-12 text-[15px] transition ${
                !cell.available
                  ? 'cursor-not-allowed text-muted/50'
                  : selectedDate === cell.date
                  ? 'bg-gold font-semibold text-white'
                  : 'font-semibold text-ink hover:bg-cream'
              } ${cell.isToday && selectedDate !== cell.date ? 'ring-1 ring-inset ring-gold/60' : ''}`}
            >
              {cell.dayNum}
              {cell.available && selectedDate !== cell.date && (
                <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-gold" aria-hidden="true" />
              )}
            </button>
          ) : (
            <div key={`empty-${i}`} />
          ),
        )}
      </div>
    </div>
  );
}
