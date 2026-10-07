import type { CrewDashboard } from '@/lib/earnings';
import { formatMoney } from '@/lib/format';
import { intlLocale, translator, type Locale } from '@/lib/i18n';
import { crewMessages } from '@/lib/i18n/messages/crew';

const dayIn = (iso: string, locale: Locale) => new Date(`${iso}T12:00:00`).toLocaleDateString(intlLocale(locale), { weekday: 'short', month: 'short', day: 'numeric' });
const FREQ = { WEEKLY: 'freqWeekly', BIWEEKLY: 'freqBiweekly', SEMIMONTHLY: 'freqSemimonthly', MONTHLY: 'freqMonthly' } as const;

/**
 * The cleaner's pay, under the day's jobs: what they've earned this pay
 * period and the next payout. Only their own numbers. (The week ahead —
 * placement, team, price — shows on each job's row and in the home hero,
 * app/crew/page.tsx.)
 */
export default function CrewDashboardCards({ data, locale = 'en' }: { data: NonNullable<CrewDashboard>; locale?: Locale }) {
  const t = translator(crewMessages, locale);
  const day = (iso: string) => dayIn(iso, locale);
  const earned = data.earned;
  const total = earned ? (earned.payCents ?? 0) + earned.tipCents : 0;
  const tile = 'rounded-2xl border border-tc-200 bg-white p-4 sm:p-5';
  const label = 'text-[13px] font-semibold leading-snug text-tc-500';
  const figure = 'mt-1.5 font-tc-display text-[26px] font-extrabold leading-none tracking-[-0.03em] tabular-nums text-tc-900';
  return (
    <section aria-label={t('dashAria')} className="grid grid-cols-2 gap-3">
      <div className={tile}>
        <p className={label}>{t('dashEarned')}</p>
        {!data.period ? (
          <p className="mt-2 text-[13px] leading-snug text-tc-500">{t('dashNoPayroll')}</p>
        ) : !data.rateSet ? (
          <p className="mt-2 text-[13px] leading-snug text-tc-500">{t('dashNoRate')}</p>
        ) : (
          <>
            <p className={figure}>{formatMoney(total)}</p>
            <p className="mt-2 text-[12px] leading-snug text-tc-500">
              {t(earned?.jobs === 1 ? 'dashCleansOne' : 'dashCleansMany', { count: earned?.jobs ?? 0 })}
              {earned?.tipCents ? ` · ${t('dashTips', { amount: formatMoney(earned.tipCents) })}` : ''}
              {data.user.payType === 'HOURLY' && earned ? ` · ${t('dashHours', { hours: earned.hours })}` : ''}
            </p>
            <p className="mt-1.5 text-[12px] leading-snug text-tc-500">{t('dashPeriodNote', { start: day(data.period.start), end: day(data.period.end) })}</p>
          </>
        )}
      </div>

      <div className={tile}>
        <p className={label}>{t('dashNextPayout')}</p>
        {data.period ? (
          <>
            <p className={`${figure} !text-[22px]`}>{day(data.period.payday)}</p>
            <p className="mt-2 text-[12px] leading-snug text-tc-500">
              {t('dashPaid', { frequency: t(FREQ[data.frequency]) })}
              {data.rateSet ? ` · ${t('dashAboutSoFar', { amount: formatMoney(total) })}` : ''}
            </p>
          </>
        ) : (
          <p className="mt-2 text-[13px] leading-snug text-tc-500">{t('dashNotSet')}</p>
        )}
      </div>
    </section>
  );
}
