'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import LogoBadge from '@/components/LogoBadge';
import { formatDateLabel, formatSlotLabel } from '@/lib/scheduling';
import { SERVICE_LABELS } from '@/lib/data';
import BookingCalendar from '@/components/BookingCalendar';

const NEARBY_BEFORE_DAYS = 3;
const NEARBY_AFTER_DAYS = 14;

type Service = {
  id: string;
  key: string;
  name: string;
  recurringEligible: boolean;
  rateCents: number | null;
  rateLabel: string;
};
type Slot = { start: string; end: string; available: boolean };
type Day = { date: string; slots: Slot[] };
type Cadence = 'ONE_TIME' | 'BIWEEKLY' | 'MONTHLY';

const CADENCE_LABEL: Record<Cadence, string> = {
  ONE_TIME: 'One-time',
  BIWEEKLY: 'Every other week',
  MONTHLY: 'Monthly',
};

export default function BookWizard({
  customerName,
  services,
}: {
  customerName: string;
  services: Service[];
}) {
  const [step, setStep] = useState<'service' | 'schedule' | 'cadence' | 'confirmed'>('service');
  const [service, setService] = useState<Service | null>(null);
  const [days, setDays] = useState<Day[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selected, setSelected] = useState<Slot | null>(null);
  const [cadence, setCadence] = useState<Cadence>('ONE_TIME');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [standbyStatus, setStandbyStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  useEffect(() => {
    if (step !== 'schedule' || !service) return;
    setLoadingSlots(true);
    fetch(`/api/slots?serviceTypeId=${service.id}`)
      .then((r) => r.json())
      .then((data) => setDays(data.days))
      .finally(() => setLoadingSlots(false));
  }, [step, service]);

  const availability = useMemo(() => new Map(days.map((d) => [d.date, d.slots.some((s) => s.available)])), [days]);

  const directSlots = useMemo(() => {
    if (!selectedDate) return [];
    return days.find((d) => d.date === selectedDate)?.slots.filter((s) => s.available) ?? [];
  }, [days, selectedDate]);

  // When the chosen day has nothing open, real nearby alternatives — 3
  // days before to 2 weeks after — closest to the chosen day first.
  const nearbyDays = useMemo(() => {
    if (!selectedDate || directSlots.length > 0) return [];
    const base = new Date(`${selectedDate}T00:00:00`);
    const from = new Date(base);
    from.setDate(from.getDate() - NEARBY_BEFORE_DAYS);
    const to = new Date(base);
    to.setDate(to.getDate() + NEARBY_AFTER_DAYS);
    const fromISO = from.toISOString().slice(0, 10);
    const toISO = to.toISOString().slice(0, 10);
    return days
      .filter((d) => d.date >= fromISO && d.date <= toISO && d.slots.some((s) => s.available))
      .map((d) => ({ ...d, distance: Math.abs(new Date(`${d.date}T00:00:00`).getTime() - base.getTime()) }))
      .sort((a, b) => a.distance - b.distance);
  }, [days, selectedDate, directSlots]);

  const choseAlternateDay = !!selected && !!selectedDate && selected.start.slice(0, 10) !== selectedDate;

  function pickService(s: Service) {
    setService(s);
    setSelectedDate(null);
    setSelected(null);
    setCadence('ONE_TIME');
    setStandbyStatus('idle');
    setStep('schedule');
  }

  function pickDate(date: string) {
    setSelectedDate(date);
    setSelected(null);
    setStandbyStatus('idle');
  }

  async function requestStandby() {
    if (!service || !selectedDate) return;
    setStandbyStatus('saving');
    await fetch('/api/account/standby', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serviceTypeId: service.id, preferredDate: selectedDate, cadence }),
    }).catch(() => {});
    setStandbyStatus('saved');
  }

  function proceedFromSchedule() {
    if (!selected) return;
    if (service?.recurringEligible) {
      setStep('cadence');
    } else {
      submit('ONE_TIME');
    }
  }

  async function submit(finalCadence: Cadence) {
    if (!service || !selected) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceTypeId: service.id,
          slotStart: selected.start,
          slotEnd: selected.end,
          cadence: finalCadence,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong.');
        setSubmitting(false);
        return;
      }
      setCadence(finalCadence);
      setStep('confirmed');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (services.length === 0) {
    return (
      <main className="min-h-screen bg-white flex flex-col items-center justify-center px-6 py-12 text-center">
        <LogoBadge size="sm" />
        <p className="mt-8 max-w-sm text-slate">
          Hi {customerName} — we don't have an agreed rate on file for you yet. Please contact us directly to get set up.
        </p>
        <Link href="/account" className="btn-secondary mt-6">
          Back to your account
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white flex flex-col items-center px-6 py-10 text-ink">
      <Link href="/account" className="mb-8" aria-label="Back to your account">
        <LogoBadge size="sm" />
      </Link>

      {step === 'service' && (
        <div className="card w-full max-w-md">
          <h1 className="text-xl font-bold mb-1">Welcome back, {customerName.split(' ')[0]}</h1>
          <p className="text-sm text-slate mb-6">Pick a service — you'll see your own agreed rate.</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {services.map((s) => (
              <button
                key={s.id}
                onClick={() => pickService(s)}
                className="card-interactive flex flex-col items-start gap-2 text-left"
              >
                <span className="font-semibold">{s.name}</span>
                <span className="pill bg-gold/15 text-bronze">{s.rateLabel}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 'schedule' && service && (
        <div className="card w-full max-w-lg">
          <button onClick={() => setStep('service')} className="text-sm text-muted mb-4 hover:text-ink">
            ← Back
          </button>
          <h1 className="text-xl font-bold mb-1">{service.name}</h1>
          <p className="text-sm text-slate mb-6">
            Your rate: <span className="font-semibold text-bronze">{service.rateLabel}</span> · pick a day on the
            calendar, up to a year out — every date shown is our crew's real availability.
          </p>
          {loadingSlots ? (
            <p className="text-sm text-muted">Loading real availability…</p>
          ) : (
            <>
              <BookingCalendar availability={availability} selectedDate={selectedDate} onSelectDate={pickDate} />

              {selectedDate && directSlots.length > 0 && (
                <div className="mt-5">
                  <p className="text-sm font-semibold text-bronze mb-2">{formatDateLabel(selectedDate)}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {directSlots.map((slot) => (
                      <button
                        key={slot.start}
                        onClick={() => setSelected(slot)}
                        className={`rounded-lg border-2 px-3 py-2 text-sm font-medium transition ${
                          selected?.start === slot.start ? 'border-gold bg-gold/10 text-ink' : 'border-line hover:border-gold'
                        }`}
                      >
                        {formatSlotLabel(slot.start, slot.end)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {selectedDate && directSlots.length === 0 && (
                <div className="mt-5">
                  <p className="text-sm font-semibold text-ink mb-1">Nothing open on {formatDateLabel(selectedDate)}</p>
                  <p className="text-sm text-slate mb-3">Here's what's open nearby — {NEARBY_BEFORE_DAYS} days before to {NEARBY_AFTER_DAYS / 7} weeks after:</p>
                  {nearbyDays.length === 0 ? (
                    <p className="text-sm text-muted">Nothing open nearby either — try another month, or hold your spot below.</p>
                  ) : (
                    <div className="max-h-[220px] space-y-4 overflow-y-auto pr-1">
                      {nearbyDays.map((day) => (
                        <div key={day.date}>
                          <p className="text-xs font-semibold text-bronze mb-1.5">{formatDateLabel(day.date)}</p>
                          <div className="grid grid-cols-2 gap-2">
                            {day.slots
                              .filter((s) => s.available)
                              .map((slot) => (
                                <button
                                  key={slot.start}
                                  onClick={() => setSelected(slot)}
                                  className={`rounded-lg border-2 px-3 py-2 text-sm font-medium transition ${
                                    selected?.start === slot.start ? 'border-gold bg-gold/10 text-ink' : 'border-line hover:border-gold'
                                  }`}
                                >
                                  {formatSlotLabel(slot.start, slot.end)}
                                </button>
                              ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-4 rounded-xl bg-cream px-4 py-3">
                    {standbyStatus === 'saved' ? (
                      <p className="text-sm font-semibold text-bronze">
                        ✓ You're on standby for {formatDateLabel(selectedDate)} — we'll let you know if it opens up.
                      </p>
                    ) : (
                      <>
                        <p className="text-sm text-ink">
                          Rather have <strong>{formatDateLabel(selectedDate)}</strong>? We'll notify you the moment a spot
                          opens up that day.
                        </p>
                        <button
                          onClick={requestStandby}
                          disabled={standbyStatus === 'saving'}
                          className="btn-secondary !px-4 !py-2 mt-2 text-sm"
                        >
                          {standbyStatus === 'saving' ? 'Holding your spot…' : `Hold my spot for ${formatDateLabel(selectedDate)}`}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}

              {choseAlternateDay && standbyStatus !== 'saved' && (
                <p className="mt-3 text-xs text-muted">
                  Booking {formatDateLabel(selected!.start.slice(0, 10))} instead — want us to watch {formatDateLabel(selectedDate!)} too? Use the button above.
                </p>
              )}
            </>
          )}
          <button disabled={!selected} onClick={proceedFromSchedule} className="btn-primary w-full mt-6">
            Continue
          </button>
        </div>
      )}

      {step === 'cadence' && service && selected && (
        <div className="card w-full max-w-md">
          <button onClick={() => setStep('schedule')} className="text-sm text-muted mb-4 hover:text-ink">
            ← Back
          </button>
          <h1 className="text-xl font-bold mb-1">How often?</h1>
          <p className="text-sm text-slate mb-6">Last step — set your cadence for {service.name.toLowerCase()}.</p>
          <div className="grid grid-cols-1 gap-3 mb-6 sm:grid-cols-3">
            {(['ONE_TIME', 'BIWEEKLY', 'MONTHLY'] as Cadence[]).map((c) => (
              <button
                key={c}
                onClick={() => setCadence(c)}
                className={`rounded-xl border-2 px-4 py-3 text-center font-medium transition ${
                  cadence === c ? 'border-gold bg-gold/10' : 'border-line hover:border-gold'
                }`}
              >
                {CADENCE_LABEL[c]}
              </button>
            ))}
          </div>
          {cadence !== 'ONE_TIME' && (
            <p className="mb-4 rounded-lg bg-surface px-4 py-3 text-sm text-slate">
              You're set for {cadence === 'BIWEEKLY' ? 'every other' : 'every'}{' '}
              {new Date(selected.start).toLocaleDateString('en-US', { weekday: 'long' })},{' '}
              {formatSlotLabel(selected.start, selected.end)}.
            </p>
          )}
          {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
          <button disabled={submitting} onClick={() => submit(cadence)} className="btn-primary w-full">
            {submitting ? 'Booking…' : 'Confirm booking'}
          </button>
        </div>
      )}

      {step === 'confirmed' && service && selected && (
        <div className="card w-full max-w-md text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gold/15 text-2xl">
            ✓
          </div>
          <h1 className="text-xl font-bold mb-2">Booking confirmed!</h1>
          <div className="mb-6 space-y-1 text-sm text-slate">
            <p className="font-semibold text-ink">{service.name}</p>
            <p>{formatDateLabel(selected.start.split('T')[0])}</p>
            <p>{formatSlotLabel(selected.start, selected.end)}</p>
            <p>{CADENCE_LABEL[cadence]} · {service.rateLabel}</p>
          </div>
          <p className="mb-6 text-xs text-muted">
            A confirmation is on its way to your email. When the crew finishes, you'll get before-and-after photos of every room.
          </p>
          <Link href="/account" className="btn-primary w-full">
            See it in your account
          </Link>
        </div>
      )}
    </main>
  );
}
