'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import LogoBadge from '@/components/LogoBadge';
import { formatDateLabel, formatSlotLabel } from '@/lib/scheduling';

type Slot = { start: string; end: string; available: boolean };
type Day = { date: string; slots: Slot[] };

export default function NewCustomerPage() {
  const [step, setStep] = useState<'form' | 'schedule' | 'confirmed'>('form');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [days, setDays] = useState<Day[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selected, setSelected] = useState<Slot | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (step !== 'schedule') return;
    setLoadingSlots(true);
    fetch('/api/quote-slots')
      .then((r) => r.json())
      .then((data) => setDays(data.days))
      .finally(() => setLoadingSlots(false));
  }, [step]);

  async function confirmBooking() {
    if (!selected) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          phone,
          email: email || undefined,
          addressLine1,
          slotStart: selected.start,
          slotEnd: selected.end,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong.');
        setSubmitting(false);
        return;
      }
      setStep('confirmed');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const stepNumber = step === 'form' ? 1 : step === 'schedule' ? 2 : null;

  return (
    <main className="min-h-screen bg-white flex flex-col items-center px-6 py-12">
      <Link href="/" className="mb-10">
        <LogoBadge size="sm" />
      </Link>

      {stepNumber && (
        <div className="mb-6 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink/40">
          <span className={stepNumber === 1 ? 'text-bronze' : ''}>1. Your details</span>
          <span className="text-ink/20">—</span>
          <span className={stepNumber === 2 ? 'text-bronze' : ''}>2. Pick a time</span>
        </div>
      )}

      {step === 'form' && (
        <div className="card w-full max-w-md">
          <h1 className="text-xl font-bold mb-1">Get a free quote</h1>
          <p className="text-sm text-ink/60 mb-6">
            Just a few details — we'll set up an in-person visit to give you an exact price, no obligation.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setStep('schedule');
            }}
            className="space-y-4"
          >
            <div>
              <label className="label">Full name</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <label className="label">Phone number</label>
              <input
                className="input"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 (281) 555-0100"
                required
              />
            </div>
            <div>
              <label className="label">Email (optional)</label>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="label">Home address</label>
              <input
                className="input"
                value={addressLine1}
                onChange={(e) => setAddressLine1(e.target.value)}
                placeholder="123 Main St, Katy, TX"
                required
              />
            </div>
            <button type="submit" className="btn-primary w-full">
              Continue to pick a visit time
            </button>
          </form>
        </div>
      )}

      {step === 'schedule' && (
        <div className="card w-full max-w-lg">
          <button onClick={() => setStep('form')} className="text-sm text-ink/50 mb-4 hover:text-ink">
            ← Back
          </button>
          <h1 className="text-xl font-bold mb-1">Pick a quote visit time</h1>
          <p className="text-sm text-ink/60 mb-6">
            A 30-minute in-person visit — we'll look at the home and give you an exact price on the spot.
          </p>
          {loadingSlots && <p className="text-sm text-ink/50">Loading real availability…</p>}
          <div className="space-y-5 max-h-[420px] overflow-y-auto pr-1">
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
          </div>
          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
          <button
            disabled={!selected || submitting}
            onClick={confirmBooking}
            className="btn-primary w-full mt-6"
          >
            {submitting ? 'Booking…' : 'Confirm quote visit'}
          </button>
        </div>
      )}

      {step === 'confirmed' && (
        <div className="card w-full max-w-md text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gold/15 text-2xl">
            ✓
          </div>
          <h1 className="text-xl font-bold mb-2">You're booked!</h1>
          <p className="text-sm text-ink/60 mb-1">
            {selected && `${formatDateLabel(selected.start.split('T')[0])}, ${formatSlotLabel(selected.start, selected.end)}`}
          </p>
          <p className="text-sm text-ink/60 mb-6">
            We've emailed you a confirmation. The owner has been notified and will meet you at your home for the visit.
          </p>
          <Link href="/" className="btn-secondary w-full">
            Back to home
          </Link>
        </div>
      )}
    </main>
  );
}
