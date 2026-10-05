'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import LogoBadge from '@/components/LogoBadge';
import AddressInput, { type PickedAddress } from '@/components/AddressInput';
import PhoneInput from '@/components/PhoneInput';
import { formatDateLabel, formatSlotLabel } from '@/lib/scheduling';
import ProjectIntakeForm from '@/components/intake/ProjectIntakeForm';
import { needsIntake, type Intake } from '@/lib/intake';

type Slot = { start: string; end: string; available: boolean };
type Day = { date: string; slots: Slot[] };
type Service = { id: string; key: string; name: string };

const SERVICE_BLURBS: Record<string, string> = {
  STANDARD: 'Regular upkeep — kitchens, bathrooms, floors, dusting.',
  DEEP: 'A deeper one-time or quarterly clean, top to bottom.',
  MOVE_IN_OUT: 'Empty-home clean for moving in or out.',
  POST_CONSTRUCTION: 'New builds and renovations — rough, final and touch-up cleans.',
  COMMERCIAL: 'Offices, clinics and other workplaces, on a schedule that suits you.',
};

export default function NewCustomerPage() {
  const [step, setStep] = useState<'service' | 'form' | 'project' | 'schedule' | 'confirmed'>('service');
  const [intake, setIntake] = useState<Intake | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [serviceTypeId, setServiceTypeId] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [address, setAddress] = useState<PickedAddress | null>(null);
  const [bedrooms, setBedrooms] = useState('');
  // Brand-new builds can be missing from the map data — let those through as typed.
  const [useTyped, setUseTyped] = useState(false);
  const [addressError, setAddressError] = useState(false);
  const [days, setDays] = useState<Day[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selected, setSelected] = useState<Slot | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [customerEmailSent, setCustomerEmailSent] = useState(false);

  useEffect(() => {
    fetch('/api/services')
      .then((r) => r.json())
      .then((data) => {
        const list: Service[] = data.services ?? [];
        setServices(list);
        // /new?service=COMMERCIAL (from a service page) skips the picker.
        const wanted = new URLSearchParams(window.location.search).get('service');
        const match = wanted ? list.find((s) => s.key === wanted.toUpperCase()) : undefined;
        if (match) {
          setServiceTypeId(match.id);
          setStep('form');
        }
      });
  }, []);

  useEffect(() => {
    if (step !== 'schedule') return;
    setLoadingSlots(true);
    fetch('/api/quote-slots')
      .then((r) => r.json())
      .then((data) => setDays(data.days))
      .finally(() => setLoadingSlots(false));
  }, [step]);

  const selectedService = services.find((s) => s.id === serviceTypeId);
  const project = needsIntake(selectedService?.key);
  const placeLabel = selectedService?.key === 'COMMERCIAL' ? 'Business address' : selectedService?.key === 'POST_CONSTRUCTION' ? 'Site address' : 'Home address';

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
          email: email.trim(),
          addressLine1,
          address: address ?? undefined,
          bedrooms: bedrooms ? Number(bedrooms) : undefined,
          serviceTypeId,
          slotStart: selected.start,
          slotEnd: selected.end,
          intake: project && intake ? intake : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong.');
        setSubmitting(false);
        return;
      }
      setCustomerEmailSent(!!data.customerEmailSent);
      setStep('confirmed');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const steps = project ? ['service', 'form', 'project', 'schedule'] : ['service', 'form', 'schedule'];
  const stepLabels: Record<string, string> = { service: 'Service', form: 'Your details', project: 'The project', schedule: 'Pick a time' };
  const stepNumber = steps.includes(step) ? steps.indexOf(step) + 1 : null;

  return (
    <main className="min-h-screen flex flex-col items-center px-6 py-12">
      <Link href="/" className="mb-10">
        <LogoBadge size="sm" />
      </Link>

      {stepNumber && (
        <div className="mb-6 flex flex-wrap items-center justify-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
          {steps.map((k, i) => (
            <span key={k} className="flex items-center gap-2">
              {i > 0 && <span className="text-muted">—</span>}
              <span className={stepNumber === i + 1 ? 'text-bronze' : ''}>
                {i + 1}. {stepLabels[k]}
              </span>
            </span>
          ))}
        </div>
      )}

      {step === 'service' && (
        <div className="card w-full max-w-md">
          <h1 className="text-xl font-bold mb-1">What do you need cleaned?</h1>
          <p className="text-sm text-slate mb-6">
            Pick a service — we'll confirm your exact price at the quote visit.
          </p>
          <div className="space-y-3">
            {services.length === 0 && <p className="text-sm text-muted">Loading services…</p>}
            {services.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setServiceTypeId(s.id);
                  setStep('form');
                }}
                className="card w-full flex flex-col items-start text-left transition hover:border-gold hover:shadow-gold"
              >
                <span className="font-semibold text-ink">{s.name}</span>
                {SERVICE_BLURBS[s.key] && (
                  <span className="mt-1 text-sm text-slate">{SERVICE_BLURBS[s.key]}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 'form' && (
        <div className="card w-full max-w-md">
          <button onClick={() => setStep('service')} className="text-sm text-muted mb-4 hover:text-ink">
            ← Back
          </button>
          <h1 className="text-xl font-bold mb-1">Get a free quote</h1>
          <p className="text-sm text-slate mb-6">
            {selectedService ? `${selectedService.name} — ` : ''}
            Just a few details — we'll set up an in-person visit to give you an exact price, no obligation.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (process.env.NEXT_PUBLIC_MAPBOX_TOKEN && !address && !useTyped) {
                setAddressError(true);
                return;
              }
              setStep(project ? 'project' : 'schedule');
            }}
            className="space-y-4"
          >
            <div>
              <label className="label">Full name</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <label className="label">Phone number</label>
              <PhoneInput value={phone} onChange={setPhone} required />
            </div>
            <div>
              <label className="label">Email</label>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
              <p className="mt-1 text-xs text-muted">
                We send your visit confirmation and your written estimate here — it's how you approve the price.
              </p>
            </div>
            <div>
              <label className="label" htmlFor="address">
                {placeLabel}
              </label>
              <AddressInput
                id="address"
                value={addressLine1}
                onChange={(v) => {
                  setAddressLine1(v);
                  setAddressError(false);
                }}
                picked={address}
                onPick={setAddress}
                placeholder="Start typing your street address"
                required
              />
              {addressError && (
                <p className="mt-1 text-sm text-red-600">
                  Please pick your address from the suggestions.{' '}
                  <button
                    type="button"
                    className="font-semibold underline"
                    onClick={() => {
                      setUseTyped(true);
                      setAddressError(false);
                    }}
                  >
                    It's not listed — use what I typed
                  </button>
                </p>
              )}
            </div>
            {!project && (
            <div>
              <label className="label" htmlFor="bedrooms">
                Bedrooms
              </label>
              <select id="bedrooms" className="input" value={bedrooms} onChange={(e) => setBedrooms(e.target.value)}>
                <option value="">Not sure yet</option>
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n} {n === 6 ? '+' : ''}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted">So we can set up your checklist room-by-room.</p>
            </div>
            )}
            <button type="submit" className="btn-primary w-full">
              {project ? 'Continue' : 'Continue to pick a visit time'}
            </button>
          </form>
        </div>
      )}

      {step === 'project' && selectedService && needsIntake(selectedService.key) && (
        <div className="card w-full max-w-lg">
          <ProjectIntakeForm
            kind={selectedService.key as 'POST_CONSTRUCTION' | 'COMMERCIAL'}
            initial={intake}
            onBack={() => setStep('form')}
            onDone={(v) => {
              setIntake(v);
              setStep('schedule');
            }}
          />
        </div>
      )}

      {step === 'schedule' && (
        <div className="card w-full max-w-lg">
          <button onClick={() => setStep(project ? 'project' : 'form')} className="text-sm text-muted mb-4 hover:text-ink">
            ← Back
          </button>
          <h1 className="text-xl font-bold mb-1">{project ? 'Pick a walkthrough time' : 'Pick a quote visit time'}</h1>
          <p className="text-sm text-slate mb-6">
            {project
              ? "An in-person walkthrough of the site — we'll confirm the scope and send you a written quote."
              : "A 30-minute in-person visit — we'll look at the home and give you an exact price on the spot."}
          </p>
          {loadingSlots && <p className="text-sm text-muted">Loading real availability…</p>}
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
          <p className="text-sm text-slate mb-1">
            {selectedService?.name}
            {selectedService ? ' — ' : ''}
            {selected && `${formatDateLabel(selected.start.split('T')[0])}, ${formatSlotLabel(selected.start, selected.end)}`}
          </p>
          <p className="text-sm text-slate mb-6">
            {customerEmailSent
              ? "We've emailed you a confirmation. "
              : ''}
            {selectedService?.key === 'COMMERCIAL'
              ? "We'll meet you at your business for the walkthrough and send your written quote after."
              : selectedService?.key === 'POST_CONSTRUCTION'
              ? "We'll meet you on site for the walkthrough and send a written quote for each phase."
              : 'The owner has been notified and will meet you at your home for the visit.'}
          </p>
          <Link href="/" className="btn-secondary w-full">
            Back to home
          </Link>
        </div>
      )}
    </main>
  );
}
