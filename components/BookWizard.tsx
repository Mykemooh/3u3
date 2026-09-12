'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import LogoBadge from '@/components/LogoBadge';
import { formatDateLabel, formatSlotLabel } from '@/lib/scheduling';
import { SERVICE_LABELS } from '@/lib/data';

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
  const [selected, setSelected] = useState<Slot | null>(null);
  const [cadence, setCadence] = useState<Cadence>('ONE_TIME');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (step !== 'schedule' || !service) return;
    setLoadingSlots(true);
    fetch(`/api/slots?serviceTypeId=${service.id}`)
      .then((r) => r.json())
      .then((data) => setDays(data.days))
      .finally(() => setLoadingSlots(false));
  }, [step, service]);

  function pickService(s: Service) {
    setService(s);
    setSelected(null);
    setCadence('ONE_TIME');
    setStep('schedule');
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
        <p className="mt-8 max-w-sm text-ink/60">
          Hi {customerName} — we don't have an agreed rate on file for you yet. Please contact us directly to get set up.
        </p>
        <Link href="/" className="btn-secondary mt-6">
          Back to home
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white flex flex-col items-center px-6 py-10 text-ink">
      <Link href="/" className="mb-8">
        <LogoBadge size="sm" />
      </Link>

      {step === 'service' && (
        <div className="card w-full max-w-md">
          <h1 className="text-xl font-bold mb-1">Welcome back, {customerName.split(' ')[0]}</h1>
          <p className="text-sm text-ink/60 mb-6">Pick a service — you'll see your own agreed rate.</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {services.map((s) => (
              <button
                key={s.id}
                onClick={() => pickService(s)}
                className="flex flex-col items-start gap-2 rounded-xl border-2 border-ink/10 px-4 py-4 text-left transition hover:border-gold"
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
          <button onClick={() => setStep('service')} className="text-sm text-ink/50 mb-4 hover:text-ink">
            ← Back
          </button>
          <h1 className="text-xl font-bold mb-1">{service.name}</h1>
          <p className="text-sm text-ink/60 mb-6">
            Your rate: <span className="font-semibold text-bronze">{service.rateLabel}</span> · pick a real open slot on our crew's calendar.
          </p>
          {loadingSlots && <p className="text-sm text-ink/50">Loading real availability…</p>}
          <div className="space-y-5 max-h-[380px] overflow-y-auto pr-1">
            {days.filter((d) => d.slots.some((s) => s.available)).map((day) => (
              <div key={day.date}>
                <p className="text-sm font-semibold text-bronze mb-2">{formatDateLabel(day.date)}</p>
                <div className="grid grid-cols-2 gap-2">
                  {day.slots.map((slot) => (
                    <button
                      key={slot.start}
                      disabled={!slot.available}
                      onClick={() => setSelected(slot)}
                      className={`rounded-lg border-2 px-3 py-2 text-sm font-medium transition ${
                        !slot.available
                          ? 'cursor-not-allowed border-ink/5 bg-ink/5 text-ink/30 line-through'
                          : selected?.start === slot.start
                          ? 'border-gold bg-gold/10 text-ink'
                          : 'border-ink/10 hover:border-gold'
                      }`}
                    >
                      {formatSlotLabel(slot.start, slot.end)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {!loadingSlots && days.every((d) => !d.slots.some((s) => s.available)) && (
              <p className="text-sm text-ink/50">No open slots in the next 10 days — please check back soon.</p>
            )}
          </div>
          <button disabled={!selected} onClick={proceedFromSchedule} className="btn-primary w-full mt-6">
            Continue
          </button>
        </div>
      )}

      {step === 'cadence' && service && selected && (
        <div className="card w-full max-w-md">
          <button onClick={() => setStep('schedule')} className="text-sm text-ink/50 mb-4 hover:text-ink">
            ← Back
          </button>
          <h1 className="text-xl font-bold mb-1">How often?</h1>
          <p className="text-sm text-ink/60 mb-6">Last step — set your cadence for {service.name.toLowerCase()}.</p>
          <div className="grid grid-cols-1 gap-3 mb-6 sm:grid-cols-3">
            {(['ONE_TIME', 'BIWEEKLY', 'MONTHLY'] as Cadence[]).map((c) => (
              <button
                key={c}
                onClick={() => setCadence(c)}
                className={`rounded-xl border-2 px-4 py-3 text-center font-medium transition ${
                  cadence === c ? 'border-gold bg-gold/10' : 'border-ink/10 hover:border-gold'
                }`}
              >
                {CADENCE_LABEL[c]}
              </button>
            ))}
          </div>
          {cadence !== 'ONE_TIME' && (
            <p className="mb-4 rounded-lg bg-cream px-4 py-3 text-sm text-ink/70">
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
          <div className="mb-6 space-y-1 text-sm text-ink/70">
            <p className="font-semibold text-ink">{service.name}</p>
            <p>{formatDateLabel(selected.start.split('T')[0])}</p>
            <p>{formatSlotLabel(selected.start, selected.end)}</p>
            <p>{CADENCE_LABEL[cadence]} · {service.rateLabel}</p>
          </div>
          <p className="mb-6 text-xs text-ink/50">
            You'll get an email confirmation now, and a reminder before each visit.
          </p>
          <Link href="/" className="btn-secondary w-full">
            Back to home
          </Link>
        </div>
      )}
    </main>
  );
}
