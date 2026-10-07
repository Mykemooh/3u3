'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import LogoBadge from '@/components/LogoBadge';
import AddressInput, { type PickedAddress } from '@/components/AddressInput';
import PhoneInput from '@/components/PhoneInput';
import { formatDateLabel, formatSlotLabel } from '@/lib/scheduling';
import ProjectIntakeForm from '@/components/intake/ProjectIntakeForm';
import { needsIntake, type Intake } from '@/lib/intake';
import { serviceName } from '@/lib/format';
import { useLocale, useT } from '@/components/i18n/LocaleProvider';
import { authMessages } from '@/lib/i18n/messages/auth';

type Slot = { start: string; end: string; available: boolean };
type Day = { date: string; slots: Slot[] };
type Service = { id: string; key: string; name: string };

const SERVICE_BLURBS = {
  STANDARD: 'newBlurbStandard',
  DEEP: 'newBlurbDeep',
  MOVE_IN_OUT: 'newBlurbMoveInOut',
  POST_CONSTRUCTION: 'newBlurbPostConstruction',
  COMMERCIAL: 'newBlurbCommercial',
} as const;
const blurbKey = (key: string) => SERVICE_BLURBS[key as keyof typeof SERVICE_BLURBS];

export default function NewCustomerPage() {
  const t = useT(authMessages);
  const locale = useLocale();
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
  const placeLabel = selectedService?.key === 'COMMERCIAL' ? t('newBusinessAddress') : selectedService?.key === 'POST_CONSTRUCTION' ? t('newSiteAddress') : t('newHomeAddress');
  const nameOf = (s: Service) => serviceName(s.key, s.name, locale);

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
        setError(data.error || t('errorGeneric'));
        setSubmitting(false);
        return;
      }
      setCustomerEmailSent(!!data.customerEmailSent);
      setStep('confirmed');
    } catch {
      setError(t('errorRetry'));
    } finally {
      setSubmitting(false);
    }
  }

  const steps = project ? ['service', 'form', 'project', 'schedule'] : ['service', 'form', 'schedule'];
  const stepLabels: Record<string, string> = {
    service: t('newStepService'),
    form: t('newStepForm'),
    project: t('newStepProject'),
    schedule: t('newStepSchedule'),
  };
  const stepNumber = steps.includes(step) ? steps.indexOf(step) + 1 : null;

  return (
    <main className="min-h-screen flex flex-col items-center px-6 py-12">
      <Link href="/" className="mb-10">
        <LogoBadge size="sm" />
      </Link>

      {stepNumber && (
        <ol className="mb-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm font-semibold text-muted">
          {steps.map((k, i) => (
            <li key={k} className="flex items-center gap-3" aria-current={stepNumber === i + 1 ? 'step' : undefined}>
              {i > 0 && <span className="h-px w-4 bg-line" aria-hidden="true" />}
              <span className={stepNumber === i + 1 ? 'text-bronze' : ''}>
                {i + 1}. {stepLabels[k]}
              </span>
            </li>
          ))}
        </ol>
      )}

      {step === 'service' && (
        <div className="card w-full max-w-md">
          <h1 className="ct-title mb-1">{t('newServiceTitle')}</h1>
          <p className="text-sm text-slate mb-6">
            {t('newServiceIntro')}
          </p>
          <div className="space-y-3">
            {services.length === 0 && <p className="text-sm text-muted">{t('newLoadingServices')}</p>}
            {services.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setServiceTypeId(s.id);
                  setStep('form');
                }}
                className="card w-full flex flex-col items-start text-left transition hover:border-gold hover:shadow-gold"
              >
                <span className="font-semibold text-ink">{nameOf(s)}</span>
                {blurbKey(s.key) && (
                  <span className="mt-1 text-sm text-slate">{t(blurbKey(s.key))}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 'form' && (
        <div className="card w-full max-w-md">
          <button onClick={() => setStep('service')} className="text-sm text-muted mb-4 hover:text-ink">
            {t('back')}
          </button>
          <h1 className="ct-title mb-1">{t('newFormTitle')}</h1>
          <p className="text-sm text-slate mb-6">
            {selectedService ? t('newFormIntroService', { service: nameOf(selectedService) }) : t('newFormIntro')}
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
              <label className="label">{t('newFullName')}</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <label className="label">{t('newPhone')}</label>
              <PhoneInput value={phone} onChange={setPhone} required />
            </div>
            <div>
              <label className="label">{t('newEmail')}</label>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('newEmailPlaceholder')}
                autoComplete="email"
                required
              />
              <p className="mt-1 text-sm text-muted">
                {t('newEmailHelp')}
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
                placeholder={t('newAddressPlaceholder')}
                required
              />
              {addressError && (
                <p className="mt-1 text-sm text-red-600">
                  {t('newAddressPick')}{' '}
                  <button
                    type="button"
                    className="font-semibold underline"
                    onClick={() => {
                      setUseTyped(true);
                      setAddressError(false);
                    }}
                  >
                    {t('newAddressUseTyped')}
                  </button>
                </p>
              )}
            </div>
            {!project && (
            <div>
              <label className="label" htmlFor="bedrooms">
                {t('newBedrooms')}
              </label>
              <select id="bedrooms" className="input" value={bedrooms} onChange={(e) => setBedrooms(e.target.value)}>
                <option value="">{t('newBedroomsUnsure')}</option>
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n} {n === 6 ? '+' : ''}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-sm text-muted">{t('newBedroomsHelp')}</p>
            </div>
            )}
            <button type="submit" className="btn-primary w-full">
              {project ? t('continue') : t('newContinueToTime')}
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
            {t('back')}
          </button>
          <h1 className="ct-title mb-1">{project ? t('newWalkthroughTitle') : t('newVisitTitle')}</h1>
          <p className="text-sm text-slate mb-6">
            {project ? t('newWalkthroughIntro') : t('newVisitIntro')}
          </p>
          {loadingSlots && <p className="text-sm text-muted">{t('newLoadingAvailability')}</p>}
          <div className="space-y-5 max-h-[420px] overflow-y-auto pr-1">
            {days.filter((d) => d.slots.some((s) => s.available)).map((day) => (
              <div key={day.date}>
                <p className="text-sm font-semibold text-bronze mb-2">{formatDateLabel(day.date, locale)}</p>
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
          </div>
          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
          <button
            disabled={!selected || submitting}
            onClick={confirmBooking}
            className="btn-primary w-full mt-6"
          >
            {submitting ? t('newBooking') : t('newConfirmVisit')}
          </button>
        </div>
      )}

      {step === 'confirmed' && (
        <div className="card w-full max-w-md text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gold/15 text-2xl">
            ✓
          </div>
          <h1 className="ct-title mb-2">{t('newBookedTitle')}</h1>
          <p className="text-sm text-slate mb-1">
            {selectedService && nameOf(selectedService)}
            {selectedService ? ' — ' : ''}
            {selected && `${formatDateLabel(selected.start.split('T')[0], locale)}, ${formatSlotLabel(selected.start, selected.end, locale)}`}
          </p>
          <p className="text-sm text-slate mb-6">
            {customerEmailSent ? t('newEmailed') : ''}
            {selectedService?.key === 'COMMERCIAL'
              ? t('newNextCommercial')
              : selectedService?.key === 'POST_CONSTRUCTION'
              ? t('newNextPostConstruction')
              : t('newNextHome')}
          </p>
          <Link href="/" className="btn-secondary w-full">
            {t('newBackHome')}
          </Link>
        </div>
      )}
    </main>
  );
}
