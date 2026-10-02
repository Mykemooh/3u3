'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatDateLabel, formatSlotLabel } from '@/lib/scheduling';

type Cadence = 'ONE_TIME' | 'BIWEEKLY' | 'MONTHLY';
type Slot = { start: string; end: string; available: boolean };
type Day = { date: string; slots: Slot[] };

const CADENCE_LABEL: Record<Cadence, string> = {
  ONE_TIME: 'One-time',
  BIWEEKLY: 'Every other week',
  MONTHLY: 'Monthly',
};

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
      setError(data.error || "Couldn't save — please try again.");
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
      setError(data.error || "Couldn't save — please try again.");
    }
  }

  async function cancelBooking() {
    if (!confirm("Cancel this cleaning? This can't be undone.")) return;
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
      setError(data.error || "Couldn't cancel — please try again.");
    }
  }

  return (
    <div className="rounded-xl border border-line p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold text-ink">{booking.serviceName}</p>
          <p className="text-sm text-slate">
            {formatDateLabel(booking.slotStart.split('T')[0])} · {formatSlotLabel(booking.slotStart, booking.slotEnd)}
          </p>
          <p className="text-sm text-slate">
            {CADENCE_LABEL[booking.cadence]} · {booking.priceLabel}
          </p>
        </div>
        {booking.canModify ? (
          mode === 'view' && (
            <div className="flex flex-wrap gap-2">
              {booking.recurringEligible && (
                <button onClick={() => setMode('cadence')} className="btn-secondary !px-3 !py-1.5 text-xs">
                  Change frequency
                </button>
              )}
              <button onClick={() => setMode('reschedule')} className="btn-secondary !px-3 !py-1.5 text-xs">
                Reschedule
              </button>
              <button onClick={cancelBooking} disabled={saving} className="btn-secondary !px-3 !py-1.5 text-xs !border-red-200 !text-red-600">
                Cancel
              </button>
            </div>
          )
        ) : (
          <span className="pill bg-surface text-muted">Locked — within 24 hrs</span>
        )}
      </div>

      {!booking.canModify && (
        <p className="mt-2 text-xs text-muted">
          This cleaning starts in less than 24 hours, so changes need a phone call — please contact us directly.
        </p>
      )}

      {mode === 'cadence' && (
        <div className="mt-4 space-y-3 border-t border-line pt-4">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(CADENCE_LABEL) as Cadence[]).map((c) => (
              <button
                key={c}
                onClick={() => setCadence(c)}
                className={`rounded-lg border-2 px-3 py-1.5 text-sm font-medium transition ${
                  cadence === c ? 'border-gold bg-gold/10' : 'border-line hover:border-gold'
                }`}
              >
                {CADENCE_LABEL[c]}
              </button>
            ))}
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button onClick={saveCadence} disabled={saving} className="btn-primary !px-4 !py-2 text-sm">
              {saving ? 'Saving…' : 'Save frequency'}
            </button>
            <button onClick={() => setMode('view')} className="btn-secondary !px-4 !py-2 text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}

      {mode === 'reschedule' && (
        <div className="mt-4 space-y-3 border-t border-line pt-4">
          {loadingSlots && <p className="text-sm text-muted">Loading real availability…</p>}
          <div className="max-h-64 space-y-4 overflow-y-auto pr-1">
            {days.filter((d) => d.slots.some((s) => s.available)).map((day) => (
              <div key={day.date}>
                <p className="mb-2 text-sm font-semibold text-bronze">{formatDateLabel(day.date)}</p>
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
                      {formatSlotLabel(slot.start, slot.end)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {!loadingSlots && days.every((d) => !d.slots.some((s) => s.available)) && (
              <p className="text-sm text-muted">No open slots in the next 10 days — please check back soon.</p>
            )}
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button onClick={saveReschedule} disabled={saving || !selected} className="btn-primary !px-4 !py-2 text-sm">
              {saving ? 'Saving…' : 'Confirm new time'}
            </button>
            <button onClick={() => setMode('view')} className="btn-secondary !px-4 !py-2 text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
