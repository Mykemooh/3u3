import Link from 'next/link';
import type { CrewDashboard } from '@/lib/earnings';
import { formatMoney } from '@/lib/format';

const time = (s: string) => {
  const [h, m] = s.slice(11, 16).split(':').map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};
const day = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const FREQ = { WEEKLY: 'weekly', BIWEEKLY: 'every two weeks', SEMIMONTHLY: 'twice a month', MONTHLY: 'monthly' } as const;

/**
 * The cleaner's own dashboard: today's job and who they're with, the week
 * ahead with their placement on each team, what they've earned this pay
 * period, and the next payout. Only their own numbers.
 */
export default function CrewDashboardCards({ data }: { data: NonNullable<CrewDashboard> }) {
  const next = data.today[0];
  const earned = data.earned;
  const total = earned ? (earned.payCents ?? 0) + earned.tipCents : 0;
  return (
    <section aria-label="My dashboard" className="grid gap-3 sm:grid-cols-2">
      <div className="relative overflow-hidden rounded-2xl border border-line bg-white p-5">
        <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1" style={{ backgroundImage: 'linear-gradient(90deg,#016AEE,#2DBD91)' }} />
        <p className="text-sm font-semibold text-slate">Today</p>
        {next ? (
          <>
            <p className="mt-1 font-display text-2xl font-extrabold text-ink">{time(next.slotStart)}</p>
            <p className="text-sm text-ink">{next.clientName}</p>
            <p className="mt-2 text-xs text-muted">
              <span className="pill mr-1 bg-green-light text-green">{next.placement}</span>
              {next.teammates.length ? `with ${next.teammates.join(', ')}` : 'on your own'}
            </p>
            {data.today.length > 1 && <p className="mt-1 text-xs text-muted">+{data.today.length - 1} more today</p>}
          </>
        ) : (
          <p className="mt-1 font-display text-2xl font-extrabold text-ink">Day off</p>
        )}
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-line bg-white p-5">
        <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1" style={{ backgroundImage: 'linear-gradient(90deg,#016AEE,#2DBD91)' }} />
        <p className="text-sm font-semibold text-slate">Coming up · next 7 days</p>
        <p className="mt-1 font-display text-2xl font-extrabold text-ink">{data.upcoming.length} job{data.upcoming.length === 1 ? '' : 's'}</p>
        <ul className="mt-2 space-y-1.5">
          {data.upcoming.slice(0, 3).map((u) => (
            <li key={u.jobId}>
              <Link href={`/crew/jobs/${u.jobId}`} className="flex items-center justify-between gap-2 text-xs hover:text-bronze">
                <span className="text-ink">
                  {day(u.date)} · {time(u.slotStart)}
                </span>
                <span className="truncate text-muted">
                  {u.placement === 'Lead' ? 'Lead' : 'Team'} · {u.crewName}
                  {u.priceCents != null ? ` · ${formatMoney(u.priceCents)}` : ''}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-line bg-white p-5">
        <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1" style={{ backgroundImage: 'linear-gradient(90deg,#016AEE,#2DBD91)' }} />
        <p className="text-sm font-semibold text-slate">Earned this pay period</p>
        {!data.period ? (
          <p className="mt-2 text-sm text-muted">The office hasn't set the payroll calendar yet.</p>
        ) : !data.rateSet ? (
          <p className="mt-2 text-sm text-muted">Your pay rate isn't set yet — ask the office.</p>
        ) : (
          <>
            <p className="mt-1 font-display text-2xl font-extrabold text-ink">{formatMoney(total)}</p>
            <p className="text-xs text-muted">
              {earned?.jobs ?? 0} clean{earned?.jobs === 1 ? '' : 's'}
              {earned?.tipCents ? ` · ${formatMoney(earned.tipCents)} in tips` : ''}
              {data.user.payType === 'HOURLY' && earned ? ` · ${earned.hours} h` : ''}
            </p>
            <p className="mt-2 text-xs text-muted">
              {day(data.period.start)} – {day(data.period.end)}. Tips are taxable wages and are paid with your pay.
            </p>
          </>
        )}
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-line bg-white p-5">
        <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1" style={{ backgroundImage: 'linear-gradient(90deg,#016AEE,#2DBD91)' }} />
        <p className="text-sm font-semibold text-slate">Next payout</p>
        {data.period ? (
          <>
            <p className="mt-1 font-display text-2xl font-extrabold text-ink">{day(data.period.payday)}</p>
            <p className="text-xs text-muted">Paid {FREQ[data.frequency]}{data.rateSet ? ` · about ${formatMoney(total)} so far` : ''}</p>
          </>
        ) : (
          <p className="mt-2 text-sm text-muted">Not set yet.</p>
        )}
      </div>
    </section>
  );
}
