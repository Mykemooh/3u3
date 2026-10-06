import Link from 'next/link';
import type { CrewDashboard } from '@/lib/earnings';
import { formatMoney } from '@/lib/format';
import { intlLocale, translator, type Locale } from '@/lib/i18n';
import { crewMessages } from '@/lib/i18n/messages/crew';

const time = (s: string) => {
  const [h, m] = s.slice(11, 16).split(':').map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};
const dayIn = (iso: string, locale: Locale) => new Date(`${iso}T12:00:00`).toLocaleDateString(intlLocale(locale), { weekday: 'short', month: 'short', day: 'numeric' });
const FREQ = { WEEKLY: 'freqWeekly', BIWEEKLY: 'freqBiweekly', SEMIMONTHLY: 'freqSemimonthly', MONTHLY: 'freqMonthly' } as const;

/**
 * The cleaner's own dashboard: today's job and who they're with, the week
 * ahead with their placement on each team, what they've earned this pay
 * period, and the next payout. Only their own numbers.
 */
export default function CrewDashboardCards({ data, locale = 'en' }: { data: NonNullable<CrewDashboard>; locale?: Locale }) {
  const t = translator(crewMessages, locale);
  const day = (iso: string) => dayIn(iso, locale);
  const next = data.today[0];
  const earned = data.earned;
  const total = earned ? (earned.payCents ?? 0) + earned.tipCents : 0;
  return (
    <section aria-label={t('dashAria')} className="grid gap-3 sm:grid-cols-2">
      <div className="relative overflow-hidden rounded-2xl border border-line bg-white p-5">
        <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1" style={{ backgroundImage: 'linear-gradient(90deg,#016AEE,#2DBD91)' }} />
        <p className="text-sm font-semibold text-slate">{t('dashToday')}</p>
        {next ? (
          <>
            <p className="mt-1 font-display text-2xl font-extrabold text-ink">{time(next.slotStart)}</p>
            <p className="text-sm text-ink">{next.clientName}</p>
            <p className="mt-2 text-xs text-muted">
              <span className="pill mr-1 bg-green-light text-green">{next.placement === 'Lead' ? t('dashLead') : t('dashTeamMember')}</span>
              {next.teammates.length ? t('dashWith', { names: next.teammates.join(', ') }) : t('dashOnYourOwn')}
            </p>
            {data.today.length > 1 && <p className="mt-1 text-xs text-muted">{t('dashMoreToday', { count: data.today.length - 1 })}</p>}
          </>
        ) : (
          <p className="mt-1 font-display text-2xl font-extrabold text-ink">{t('dashDayOff')}</p>
        )}
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-line bg-white p-5">
        <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1" style={{ backgroundImage: 'linear-gradient(90deg,#016AEE,#2DBD91)' }} />
        <p className="text-sm font-semibold text-slate">{t('dashComingUp')}</p>
        <p className="mt-1 font-display text-2xl font-extrabold text-ink">{t(data.upcoming.length === 1 ? 'dashJobsOne' : 'dashJobsMany', { count: data.upcoming.length })}</p>
        <ul className="mt-2 space-y-1.5">
          {data.upcoming.slice(0, 3).map((u) => (
            <li key={u.jobId}>
              <Link href={`/crew/jobs/${u.jobId}`} className="flex items-center justify-between gap-2 text-xs hover:text-bronze">
                <span className="text-ink">
                  {day(u.date)} · {time(u.slotStart)}
                </span>
                <span className="truncate text-muted">
                  {u.placement === 'Lead' ? t('dashLead') : t('dashTeam')} · {u.crewName}
                  {u.priceCents != null ? ` · ${formatMoney(u.priceCents)}` : ''}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-line bg-white p-5">
        <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1" style={{ backgroundImage: 'linear-gradient(90deg,#016AEE,#2DBD91)' }} />
        <p className="text-sm font-semibold text-slate">{t('dashEarned')}</p>
        {!data.period ? (
          <p className="mt-2 text-sm text-muted">{t('dashNoPayroll')}</p>
        ) : !data.rateSet ? (
          <p className="mt-2 text-sm text-muted">{t('dashNoRate')}</p>
        ) : (
          <>
            <p className="mt-1 font-display text-2xl font-extrabold text-ink">{formatMoney(total)}</p>
            <p className="text-xs text-muted">
              {t(earned?.jobs === 1 ? 'dashCleansOne' : 'dashCleansMany', { count: earned?.jobs ?? 0 })}
              {earned?.tipCents ? ` · ${t('dashTips', { amount: formatMoney(earned.tipCents) })}` : ''}
              {data.user.payType === 'HOURLY' && earned ? ` · ${t('dashHours', { hours: earned.hours })}` : ''}
            </p>
            <p className="mt-2 text-xs text-muted">
              {t('dashPeriodNote', { start: day(data.period.start), end: day(data.period.end) })}
            </p>
          </>
        )}
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-line bg-white p-5">
        <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1" style={{ backgroundImage: 'linear-gradient(90deg,#016AEE,#2DBD91)' }} />
        <p className="text-sm font-semibold text-slate">{t('dashNextPayout')}</p>
        {data.period ? (
          <>
            <p className="mt-1 font-display text-2xl font-extrabold text-ink">{day(data.period.payday)}</p>
            <p className="text-xs text-muted">{t('dashPaid', { frequency: t(FREQ[data.frequency]) })}{data.rateSet ? ` · ${t('dashAboutSoFar', { amount: formatMoney(total) })}` : ''}</p>
          </>
        ) : (
          <p className="mt-2 text-sm text-muted">{t('dashNotSet')}</p>
        )}
      </div>
    </section>
  );
}
