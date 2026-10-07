'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CLIENT_CADENCES, type Cadence } from '@/lib/cadence';
import { formatDateLabel, formatSlotLabel } from '@/lib/scheduling';
import { useLocale, useT } from '@/components/i18n/LocaleProvider';
import { commonMessages } from '@/lib/i18n/messages/common';

type Slot = { start: string; end: string; available: boolean };
type Day = { date: string; slots: Slot[] };

const CADENCE_KEY = {
  ONE_TIME: 'cadenceOneTime',
  WEEKLY: 'cadenceWeekly',
  BIWEEKLY: 'cadenceBiweekly',
  EVERY_4_WEEKS: 'cadenceEvery4Weeks',
  MONTHLY: 'cadenceMonthly',
  CUSTOM: 'cadenceCustom',
} as const satisfies Record<Cadence, keyof typeof commonMessages.en>;

export default function MyBookingCard({
  booking,
}: {
  booking: {
    id: string;
    serviceTypeId: string | null;
    serviceName: string;
    slotStart: string;
    slotEnd: string;
    cadence: Cadence;
    recurringEligible: boolean;
    canModify: boolean;
    priceLabel: string;
  };
}) {
  const t = useT(commonMessages);
  const locale = useLocale();
  const router = useRouter();
  const [mode, setMode] = useState<'view' | 'cadence' | 'reschedule'>('view');
  const [cadence, setCadence] = useState<Cadence>(booking.cadence);
  const [days, setDays] = useState<Day[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selected, setSelected] = useState<Slot | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (mode !== 'reschedule' || !booking.serviceTypeId) return;
    setLoadingSlots(true);
    fetch(`/api/slots?serviceTypeId=${booking.serviceTypeId}`)
      .then((r) => r.json())
      .then((data) => setDays(data.days ?? []))
      .finally(() => setLoadingSlots(false));
  }, [mode, booking.serviceTypeId]);

  async function saveCadence() {
    setSaving(true);
    setError('');
    const res = await fetch(`/api/account/bookings/${booking.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cadence', cadence }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (res.ok) {
      setMode('view');
      router.refresh();
    } else {
      setError(data.error || t('saveError'));
    }
  }

  async function saveReschedule() {
    if (!selected) return;
    setSaving(true);
    setError('');
    const res = await fetch(`/api/account/bookings/${booking.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reschedule', slotStart: selected.start, slotEnd: selected.end }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (res.ok) {
      setMode('view');
      router.refresh();
    } else {
      setError(data.error || t('saveError'));
    }
  }

  async function cancelBooking() {
    if (!confirm(t('bookCancelConfirm'))) return;
    setSaving(true);
    setError('');
    const res = await fetch(`/api/account/bookings/${booking.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cancel' }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (res.ok) {
      router.refresh();
    } else {
      setError(data.error || t('bookCancelError'));
    }
  }

  return (
    <div className="rounded-xl border border-line p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold text-ink">{booking.serviceName}</p>
          <p className="text-sm text-slate">
            {formatDateLabel(booking.slotStart.split('T')[0], locale)} · {formatSlotLabel(booking.slotStart, booking.slotEnd, locale)}
          </p>
          <p className="text-sm text-slate">
            {t(CADENCE_KEY[booking.cadence])} · {booking.priceLabel}
          </p>
        </div>
        {booking.canModify ? (
          mode === 'view' && (
            <div className="flex flex-wrap gap-2">
              {booking.recurringEligible && (
                <button onClick={() => setMode('cadence')} className="btn-secondary !px-3 !py-1.5 text-xs">
                  {t('bookChangeFrequency')}
                </button>
              )}
              <button onClick={() => setMode('reschedule')} className="btn-secondary !px-3 !py-1.5 text-xs">
                {t('bookReschedule')}
              </button>
              <button onClick={cancelBooking} disabled={saving} className="btn-secondary !px-3 !py-1.5 text-xs !border-red-200 !text-red-600">
                {t('cancel')}
              </button>
            </div>
          )
        ) : (
          <span className="pill bg-surface text-muted">{t('bookLocked')}</span>
        )}
      </div>

      {!booking.canModify && (
        <p className="mt-2 text-xs text-muted">
          {t('bookLockedHelp')}
        </p>
      )}

      {mode === 'cadence' && (
        <div className="mt-4 space-y-3 border-t border-line pt-4">
          <div className="flex flex-wrap gap-2">
            {CLIENT_CADENCES.map((c) => (
              <button
                key={c}
                onClick={() => setCadence(c)}
                className={`rounded-lg border-2 px-3 py-1.5 text-sm font-medium transition ${
                  cadence === c ? 'border-gold bg-gold/10' : 'border-line hover:border-gold'
                }`}
              >
                {t(CADENCE_KEY[c])}
              </button>
            ))}
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button onClick={saveCadence} disabled={saving} className="btn-primary !px-4 !py-2 text-sm">
              {saving ? t('saving') : t('bookSaveFrequency')}
            </button>
            <button onClick={() => setMode('view')} className="btn-secondary !px-4 !py-2 text-sm">
              {t('cancel')}
            </button>
          </div>
        </div>
      )}

      {mode === 'reschedule' && (
        <div className="mt-4 space-y-3 border-t border-line pt-4">
          {loadingSlots && <p className="text-sm text-muted">{t('bookLoadingSlots')}</p>}
          <div className="max-h-64 space-y-4 overflow-y-auto pr-1">
            {days.filter((d) => d.slots.some((s) => s.available)).map((day) => (
              <div key={day.date}>
                <p className="mb-2 text-sm font-semibold text-bronze">{formatDateLabel(day.date, locale)}</p>
                <div className="grid grid-cols-2 gap-2">
                  {day.slots.map((slot) => (
                    <button
                      key={slot.start}
                      disabled={!slot.available}
                      onClick={() => setSelected(slot)}
                      className={`rounded-lg border-2 px-3 py-2 text-sm font-medium transition ${
                        !slot.available
                          ? 'cursor-not-allowed border-line bg-surface text-muted line-through'
                          : selected?.start === slot.start
                          ? 'border-gold bg-gold/10 text-ink'
                          : 'border-line hover:border-gold'
                      }`}
                    >
                      {formatSlotLabel(slot.start, slot.end, locale)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {!loadingSlots && days.every((d) => !d.slots.some((s) => s.available)) && (
              <p className="text-sm text-muted">{t('bookNoSlots')}</p>
            )}
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button onClick={saveReschedule} disabled={saving || !selected} className="btn-primary !px-4 !py-2 text-sm">
              {saving ? t('saving') : t('bookConfirmTime')}
            </button>
            <button onClick={() => setMode('view')} className="btn-secondary !px-4 !py-2 text-sm">
              {t('cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
