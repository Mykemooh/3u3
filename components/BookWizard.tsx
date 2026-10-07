'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import LogoBadge from '@/components/LogoBadge';
import { formatDateLabel, formatSlotLabel } from '@/lib/scheduling';
import { formatMoney, serviceName } from '@/lib/format';
import BookingCalendar from '@/components/BookingCalendar';
import { useLocale, useT } from '@/components/i18n/LocaleProvider';
import { intlLocale } from '@/lib/i18n';
import { rich } from '@/lib/i18n/rich';
import { bookMessages } from '@/lib/i18n/messages/book';

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
type AddOn = { id: string; name: string; description: string | null; priceCents: number };

const CADENCE_LABEL: Record<Cadence, 'cadenceOneTime' | 'cadenceBiweekly' | 'cadenceMonthly'> = {
  ONE_TIME: 'cadenceOneTime',
  BIWEEKLY: 'cadenceBiweekly',
  MONTHLY: 'cadenceMonthly',
};

export default function BookWizard({
  customerName,
  services,
  addOns,
}: {
  customerName: string;
  services: Service[];
  addOns: AddOn[];
}) {
  const t = useT(bookMessages);
  const locale = useLocale();
  const dateLabel = (iso: string) => formatDateLabel(iso, locale);
  const nameOf = (s: Service) => serviceName(s.key, s.name, locale);
  const firstName = customerName.split(' ')[0];
  const [step, setStep] = useState<'service' | 'schedule' | 'addons' | 'cadence' | 'confirmed'>('service');
  const [service, setService] = useState<Service | null>(null);
  const [days, setDays] = useState<Day[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selected, setSelected] = useState<Slot | null>(null);
  const [cadence, setCadence] = useState<Cadence>('ONE_TIME');
  const [selectedAddOnIds, setSelectedAddOnIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [standbyStatus, setStandbyStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  const selectedAddOns = useMemo(() => addOns.filter((a) => selectedAddOnIds.has(a.id)), [addOns, selectedAddOnIds]);
  const addOnsTotalCents = useMemo(() => selectedAddOns.reduce((sum, a) => sum + a.priceCents, 0), [selectedAddOns]);

  function toggleAddOn(id: string) {
    setSelectedAddOnIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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
    setSelectedAddOnIds(new Set());
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
    if (addOns.length > 0) {
      setStep('addons');
    } else if (service?.recurringEligible) {
      setStep('cadence');
    } else {
      submit('ONE_TIME');
    }
  }

  function proceedFromAddOns() {
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
          addOnServiceIds: Array.from(selectedAddOnIds),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t('errorGeneric'));
        setSubmitting(false);
        return;
      }
      setCadence(finalCadence);
      setStep('confirmed');
    } catch {
      setError(t('errorRetry'));
    } finally {
      setSubmitting(false);
    }
  }

  if (services.length === 0) {
    return (
      <main className="min-h-screen bg-white flex flex-col items-center justify-center px-6 py-12 text-center">
        <LogoBadge size="sm" />
        <p className="mt-8 max-w-sm text-slate">
          {customerName ? t('noRateNamed', { name: customerName }) : t('noRate')}
        </p>
        <Link href="/account" className="btn-secondary mt-6">
          {t('backToAccount')}
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white flex flex-col items-center px-6 py-10 text-ink">
      <Link href="/account" className="mb-8" aria-label={t('backToAccountAria')}>
        <LogoBadge size="sm" />
      </Link>

      {step === 'service' && (
        <div className="card w-full max-w-md">
          <h1 className="text-xl font-bold mb-1">{firstName ? t('welcomeNamed', { name: firstName }) : t('welcome')}</h1>
          <p className="text-sm text-slate mb-6">{t('pickService')}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {services.map((s) => (
              <button
                key={s.id}
                onClick={() => pickService(s)}
                className="card-interactive flex flex-col items-start gap-2 text-left"
              >
                <span className="font-semibold">{nameOf(s)}</span>
                <span className="pill bg-gold/15 text-bronze">{s.rateLabel}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 'schedule' && service && (
        <div className="card w-full max-w-lg">
          <button onClick={() => setStep('service')} className="text-sm text-muted mb-4 hover:text-ink">
            {t('back')}
          </button>
          <h1 className="text-xl font-bold mb-1">{nameOf(service)}</h1>
          <p className="text-sm text-slate mb-6">
            {rich(t('yourRate'), { rate: <span className="font-semibold text-bronze">{service.rateLabel}</span> })}
          </p>
          {loadingSlots ? (
            <p className="text-sm text-muted">{t('loadingAvailability')}</p>
          ) : (
            <>
              <BookingCalendar availability={availability} selectedDate={selectedDate} onSelectDate={pickDate} />

              {selectedDate && directSlots.length > 0 && (
                <div className="mt-5">
                  <p className="text-sm font-semibold text-bronze mb-2">{dateLabel(selectedDate)}</p>
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
                  <p className="text-sm font-semibold text-ink mb-1">{t('nothingOpenOn', { date: dateLabel(selectedDate) })}</p>
                  <p className="text-sm text-slate mb-3">{t('nearbyIntro', { before: NEARBY_BEFORE_DAYS, after: NEARBY_AFTER_DAYS / 7 })}</p>
                  {nearbyDays.length === 0 ? (
                    <p className="text-sm text-muted">{t('nothingNearby')}</p>
                  ) : (
                    <div className="max-h-[220px] space-y-4 overflow-y-auto pr-1">
                      {nearbyDays.map((day) => (
                        <div key={day.date}>
                          <p className="text-xs font-semibold text-bronze mb-1.5">{dateLabel(day.date)}</p>
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
                        {t('standbySaved', { date: dateLabel(selectedDate) })}
                      </p>
                    ) : (
                      <>
                        <p className="text-sm text-ink">
                          {rich(t('standbyOffer'), { date: <strong>{dateLabel(selectedDate)}</strong> })}
                        </p>
                        <button
                          onClick={requestStandby}
                          disabled={standbyStatus === 'saving'}
                          className="btn-secondary !px-4 !py-2 mt-2 text-sm"
                        >
                          {standbyStatus === 'saving' ? t('standbySaving') : t('standbyButton', { date: dateLabel(selectedDate) })}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}

              {choseAlternateDay && standbyStatus !== 'saved' && (
                <p className="mt-3 text-xs text-muted">
                  {t('alternateDay', { booked: dateLabel(selected!.start.slice(0, 10)), wanted: dateLabel(selectedDate!) })}
                </p>
              )}
            </>
          )}
          <button disabled={!selected} onClick={proceedFromSchedule} className="btn-primary w-full mt-6">
            {t('continue')}
          </button>
        </div>
      )}

      {step === 'addons' && service && selected && (
        <div className="card w-full max-w-md">
          <button onClick={() => setStep('schedule')} className="text-sm text-muted mb-4 hover:text-ink">
            {t('back')}
          </button>
          <h1 className="text-xl font-bold mb-1">{t('addOnsTitle')}</h1>
          <p className="text-sm text-slate mb-6">{t('addOnsIntro')}</p>
          <div className="space-y-2 mb-6">
            {addOns.map((a) => {
              const checked = selectedAddOnIds.has(a.id);
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => toggleAddOn(a.id)}
                  className={`flex w-full items-start justify-between gap-3 rounded-xl border-2 px-4 py-3 text-left transition ${
                    checked ? 'border-gold bg-gold/10' : 'border-line hover:border-gold'
                  }`}
                >
                  <span className="flex items-start gap-3">
                    <span
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 text-xs ${
                        checked ? 'border-gold bg-gold text-white' : 'border-line'
                      }`}
                      aria-hidden="true"
                    >
                      {checked ? '✓' : ''}
                    </span>
                    <span>
                      <span className="block font-semibold text-ink">{a.name}</span>
                      {a.description && <span className="block text-sm text-slate">{a.description}</span>}
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold text-bronze">{formatMoney(a.priceCents)}</span>
                </button>
              );
            })}
          </div>
          {selectedAddOns.length > 0 && (
            <p className="mb-4 text-sm text-slate">
              {rich(t('addOnsTotal'), { total: <span className="font-semibold text-ink">{formatMoney(addOnsTotalCents)}</span> })}
            </p>
          )}
          <button onClick={proceedFromAddOns} className="btn-primary w-full">
            {t('continue')}
          </button>
        </div>
      )}

      {step === 'cadence' && service && selected && (
        <div className="card w-full max-w-md">
          <button onClick={() => setStep(addOns.length > 0 ? 'addons' : 'schedule')} className="text-sm text-muted mb-4 hover:text-ink">
            {t('back')}
          </button>
          <h1 className="text-xl font-bold mb-1">{t('cadenceTitle')}</h1>
          <p className="text-sm text-slate mb-6">{t('cadenceIntro', { service: nameOf(service).toLowerCase() })}</p>
          <div className="grid grid-cols-1 gap-3 mb-6 sm:grid-cols-3">
            {(['ONE_TIME', 'BIWEEKLY', 'MONTHLY'] as Cadence[]).map((c) => (
              <button
                key={c}
                onClick={() => setCadence(c)}
                className={`rounded-xl border-2 px-4 py-3 text-center font-medium transition ${
                  cadence === c ? 'border-gold bg-gold/10' : 'border-line hover:border-gold'
                }`}
              >
                {t(CADENCE_LABEL[c])}
              </button>
            ))}
          </div>
          {cadence !== 'ONE_TIME' && (
            <p className="mb-4 rounded-lg bg-surface px-4 py-3 text-sm text-slate">
              {t(cadence === 'BIWEEKLY' ? 'cadenceBiweeklySummary' : 'cadenceMonthlySummary', {
                weekday: new Date(selected.start).toLocaleDateString(intlLocale(locale), { weekday: 'long' }),
                time: formatSlotLabel(selected.start, selected.end),
              })}
            </p>
          )}
          {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
          <button disabled={submitting} onClick={() => submit(cadence)} className="btn-primary w-full">
            {submitting ? t('booking') : t('confirmBooking')}
          </button>
        </div>
      )}

      {step === 'confirmed' && service && selected && (
        <div className="card w-full max-w-md text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gold/15 text-2xl">
            ✓
          </div>
          <h1 className="text-xl font-bold mb-2">{t('confirmedTitle')}</h1>
          <div className="mb-6 space-y-1 text-sm text-slate">
            <p className="font-semibold text-ink">{nameOf(service)}</p>
            <p>{dateLabel(selected.start.split('T')[0])}</p>
            <p>{formatSlotLabel(selected.start, selected.end)}</p>
            <p>{t(CADENCE_LABEL[cadence])} · {service.rateLabel}</p>
            {selectedAddOns.length > 0 && (
              <p>+ {selectedAddOns.map((a) => a.name).join(', ')} ({formatMoney(addOnsTotalCents)})</p>
            )}
          </div>
          <p className="mb-6 text-xs text-muted">
            {t('confirmedNote')}
          </p>
          <Link href="/account" className="btn-primary w-full">
            {t('seeInAccount')}
          </Link>
        </div>
      )}
    </main>
  );
}
