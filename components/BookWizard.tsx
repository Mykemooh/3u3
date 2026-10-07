'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
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
      <div className="card mx-auto max-w-xl px-6 py-8 text-center">
        <p className="ct-lead mx-auto max-w-[36ch]">
          {customerName ? t('noRateNamed', { name: customerName }) : t('noRate')}
        </p>
        <Link href="/account" className="btn-secondary mt-6">
          {t('backToAccount')}
        </Link>
      </div>
    );
  }

  return (
    // Sits in the client portal's frame (app/book/page.tsx → AppShell), so
    // the header, tabs and company mark are already there.
    <div className="w-full max-w-xl text-ink">

      {step === 'service' && (
        <section className="w-full">
          <h1 className="ct-title">{firstName ? t('welcomeNamed', { name: firstName }) : t('welcome')}</h1>
          <p className="ct-lead mb-6 mt-1">{t('pickService')}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {services.map((s) => (
              <button
                key={s.id}
                onClick={() => pickService(s)}
                className="card-interactive flex min-h-[112px] flex-col items-start justify-between gap-3 p-5 text-left"
              >
                <span className="ct-h3">{nameOf(s)}</span>
                <span className="money text-[17px] font-semibold text-bronze">{s.rateLabel}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {step === 'schedule' && service && (
        <section className="w-full">
          <button onClick={() => setStep('service')} className="ct-action mb-2 text-slate">
            {t('back')}
          </button>
          <h1 className="ct-title">{nameOf(service)}</h1>
          <p className="ct-lead mb-6 mt-1">
            {rich(t('yourRate'), { rate: <span className="money font-semibold text-ink">{service.rateLabel}</span> })}
          </p>
          <div className="card p-4 sm:p-6">
          {loadingSlots ? (
            <p className="ct-meta py-10 text-center">{t('loadingAvailability')}</p>
          ) : (
            <>
              <BookingCalendar availability={availability} selectedDate={selectedDate} onSelectDate={pickDate} />

              {selectedDate && directSlots.length > 0 && (
                <div className="mt-5">
                  <p className="ct-h3 mb-3">{dateLabel(selectedDate)}</p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {directSlots.map((slot) => (
                      <button
                        key={slot.start}
                        onClick={() => setSelected(slot)}
                        className={`money min-h-[48px] whitespace-nowrap rounded-xl border-2 px-3 text-[15px] font-medium transition ${
                          selected?.start === slot.start ? 'border-gold bg-gold/10 text-ink' : 'border-line hover:border-gold'
                        }`}
                      >
                        {formatSlotLabel(slot.start, slot.end, locale)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {selectedDate && directSlots.length === 0 && (
                <div className="mt-5">
                  <p className="ct-h3 mb-1">{t('nothingOpenOn', { date: dateLabel(selectedDate) })}</p>
                  <p className="mb-3 text-[15px] text-slate">{t('nearbyIntro', { before: NEARBY_BEFORE_DAYS, after: NEARBY_AFTER_DAYS / 7 })}</p>
                  {nearbyDays.length === 0 ? (
                    <p className="text-[15px] text-muted">{t('nothingNearby')}</p>
                  ) : (
                    <div className="max-h-[260px] space-y-4 overflow-y-auto pr-1">
                      {nearbyDays.map((day) => (
                        <div key={day.date}>
                          <p className="mb-2 text-sm font-semibold text-ink">{dateLabel(day.date)}</p>
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {day.slots
                              .filter((s) => s.available)
                              .map((slot) => (
                                <button
                                  key={slot.start}
                                  onClick={() => setSelected(slot)}
                                  className={`money min-h-[48px] whitespace-nowrap rounded-xl border-2 px-3 text-[15px] font-medium transition ${
                                    selected?.start === slot.start ? 'border-gold bg-gold/10 text-ink' : 'border-line hover:border-gold'
                                  }`}
                                >
                                  {formatSlotLabel(slot.start, slot.end, locale)}
                                </button>
                              ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-4 rounded-xl bg-cream px-4 py-3">
                    {standbyStatus === 'saved' ? (
                      <p className="text-[15px] font-semibold text-ink">
                        {t('standbySaved', { date: dateLabel(selectedDate) })}
                      </p>
                    ) : (
                      <>
                        <p className="text-[15px] text-ink">
                          {rich(t('standbyOffer'), { date: <strong>{dateLabel(selectedDate)}</strong> })}
                        </p>
                        <button
                          onClick={requestStandby}
                          disabled={standbyStatus === 'saving'}
                          className="btn-secondary btn-sm mt-3 min-h-[44px]"
                        >
                          {standbyStatus === 'saving' ? t('standbySaving') : t('standbyButton', { date: dateLabel(selectedDate) })}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}

              {choseAlternateDay && standbyStatus !== 'saved' && (
                <p className="mt-3 text-sm text-muted">
                  {t('alternateDay', { booked: dateLabel(selected!.start.slice(0, 10)), wanted: dateLabel(selectedDate!) })}
                </p>
              )}
            </>
          )}
          </div>
          <button disabled={!selected} onClick={proceedFromSchedule} className="btn-primary w-full mt-6">
            {t('continue')}
          </button>
        </section>
      )}

      {step === 'addons' && service && selected && (
        <section className="w-full">
          <button onClick={() => setStep('schedule')} className="ct-action mb-2 text-slate">
            {t('back')}
          </button>
          <h1 className="ct-title">{t('addOnsTitle')}</h1>
          <p className="ct-lead mb-6 mt-1">{t('addOnsIntro')}</p>
          <div className="space-y-2 mb-6">
            {addOns.map((a) => {
              const checked = selectedAddOnIds.has(a.id);
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => toggleAddOn(a.id)}
                  className={`flex min-h-[56px] w-full items-start justify-between gap-3 rounded-xl border-2 bg-white px-4 py-3.5 text-left transition ${
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
                      {a.description && <span className="mt-0.5 block text-[15px] text-slate">{a.description}</span>}
                    </span>
                  </span>
                  <span className="money shrink-0 font-semibold text-ink">{formatMoney(a.priceCents)}</span>
                </button>
              );
            })}
          </div>
          {selectedAddOns.length > 0 && (
            <p className="mb-4 text-[15px] text-slate">
              {rich(t('addOnsTotal'), { total: <span className="money font-semibold text-ink">{formatMoney(addOnsTotalCents)}</span> })}
            </p>
          )}
          <button onClick={proceedFromAddOns} className="btn-primary w-full">
            {t('continue')}
          </button>
        </section>
      )}

      {step === 'cadence' && service && selected && (
        <section className="w-full">
          <button onClick={() => setStep(addOns.length > 0 ? 'addons' : 'schedule')} className="ct-action mb-2 text-slate">
            {t('back')}
          </button>
          <h1 className="ct-title">{t('cadenceTitle')}</h1>
          <p className="ct-lead mb-6 mt-1">{t('cadenceIntro', { service: nameOf(service).toLowerCase() })}</p>
          <div className="grid grid-cols-1 gap-3 mb-6 sm:grid-cols-3">
            {(['ONE_TIME', 'BIWEEKLY', 'MONTHLY'] as Cadence[]).map((c) => (
              <button
                key={c}
                onClick={() => setCadence(c)}
                className={`min-h-[56px] rounded-xl border-2 bg-white px-4 py-3 text-center font-semibold transition ${
                  cadence === c ? 'border-gold bg-gold/10' : 'border-line hover:border-gold'
                }`}
              >
                {t(CADENCE_LABEL[c])}
              </button>
            ))}
          </div>
          {cadence !== 'ONE_TIME' && (
            <p className="mb-4 rounded-xl border border-line bg-white px-4 py-3 text-[15px] text-slate">
              {t(cadence === 'BIWEEKLY' ? 'cadenceBiweeklySummary' : 'cadenceMonthlySummary', {
                weekday: new Date(selected.start).toLocaleDateString(intlLocale(locale), { weekday: 'long' }),
                time: formatSlotLabel(selected.start, selected.end, locale),
              })}
            </p>
          )}
          {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
          <button disabled={submitting} onClick={() => submit(cadence)} className="btn-primary w-full">
            {submitting ? t('booking') : t('confirmBooking')}
          </button>
        </section>
      )}

      {step === 'confirmed' && service && selected && (
        <section className="card w-full px-6 py-8 text-center shadow-card">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-light text-green">
            <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
          </div>
          <h1 className="ct-title">{t('confirmedTitle')}</h1>
          <div className="money mb-6 mt-3 space-y-1 text-[15px] text-slate">
            <p className="ct-h3">{nameOf(service)}</p>
            <p>{dateLabel(selected.start.split('T')[0])}</p>
            <p>{formatSlotLabel(selected.start, selected.end, locale)}</p>
            <p>{t(CADENCE_LABEL[cadence])} · {service.rateLabel}</p>
            {selectedAddOns.length > 0 && (
              <p>+ {selectedAddOns.map((a) => a.name).join(', ')} ({formatMoney(addOnsTotalCents)})</p>
            )}
          </div>
          <p className="mx-auto mb-6 max-w-[40ch] text-sm text-muted">
            {t('confirmedNote')}
          </p>
          <Link href="/account" className="btn-primary w-full">
            {t('seeInAccount')}
          </Link>
        </section>
      )}
    </div>
  );
}
