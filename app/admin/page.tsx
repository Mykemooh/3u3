import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getTenant, getUnreadAdminAlerts } from '@/lib/data';
import AdminAlertsPanel from '@/components/AdminAlertsPanel';
import RevenueBars from '@/components/admin/RevenueBars';
import Icon from '@/components/Icon';
import { businessTodayISO } from '@/lib/time';
import { formatDateLabel, formatSlotLabel } from '@/lib/scheduling';
import { getAdminToday } from '@/lib/adminToday';
import { getDashboardHome, type Insight } from '@/lib/dashboardHome';
import { setupProgress } from '@/lib/setupGuide';
import { dollars } from '@/lib/billing/plans';

type RouteStatus = 'PENDING' | 'EN_ROUTE' | 'IN_PROGRESS' | 'COMPLETE' | 'OVER' | 'LATE';
const STATUS: Record<RouteStatus, { label: string; cls: string }> = {
  PENDING: { label: 'Scheduled', cls: 'bg-tc-100 text-tc-700' },
  EN_ROUTE: { label: 'On the way', cls: 'bg-blue-50 text-blue-700' },
  IN_PROGRESS: { label: 'Cleaning', cls: 'bg-tc-lime-wash text-tc-lime-ink' },
  COMPLETE: { label: 'Done', cls: 'bg-emerald-50 text-emerald-700' },
  OVER: { label: 'Running over', cls: 'bg-amber-50 text-amber-700' },
  LATE: { label: 'Late start', cls: 'bg-red-50 text-red-700' },
};

const TONE: Record<Insight['tone'], string> = {
  urgent: 'bg-red-500',
  money: 'bg-amber-500',
  plan: 'bg-tc-black',
  info: 'bg-blue-500',
};

function greeting() {
  const hour = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: process.env.BUSINESS_TIMEZONE || 'America/Chicago' }).format(new Date()));
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

function ago(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

/**
 * The owner's landing page (TRASHCAN guide §6): today in four numbers,
 * money over two weeks, today's route, the team, what changed, and
 * TRASHCAN Intelligence. The pipeline strip below keeps every stage of the
 * day one tap away.
 */
export default async function AdminToday() {
  const tenant = await getTenant();
  if (!tenant) return null;
  const session = await getServerSession(authOptions);
  const firstName = (session?.user?.name ?? '').split(/[\s(]/)[0];
  const [home, strip, alerts, setup] = await Promise.all([
    getDashboardHome(tenant.id),
    getAdminToday(tenant.id),
    getUnreadAdminAlerts(tenant.id),
    setupProgress(tenant.id),
  ]);
  const today = businessTodayISO();
  const { metrics } = home;
  const pctDone = metrics.jobsToday ? Math.round((metrics.completed / metrics.jobsToday) * 100) : 0;

  const tiles: { label: string; value: string; note: string; tone?: 'warn' }[] = [
    { label: 'Jobs today', value: String(metrics.jobsToday), note: metrics.jobsToday === 0 ? 'Nothing on the calendar' : `${home.route.filter((r) => r.status === 'IN_PROGRESS' || r.status === 'OVER').length} cleaning now` },
    { label: 'Completed', value: String(metrics.completed), note: metrics.jobsToday ? `${pctDone}% of today` : '—' },
    { label: 'Issues', value: String(metrics.issues), note: metrics.issues ? 'Need a look' : 'All on track', tone: metrics.issues ? 'warn' : undefined },
    { label: 'Revenue', value: dollars(metrics.revenueTodayCents), note: 'Collected today' },
  ];

  return (
    <div className="space-y-6">
      {/* ---- Greeting ---- */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[14px] font-medium text-tc-500">{formatDateLabel(today)}</p>
          <h2 className="mt-1 font-tc-display text-[28px] font-extrabold tracking-[-0.03em] md:text-[34px]">
            {greeting()}
            {firstName ? `, ${firstName}` : ''}.
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {setup.remaining > 0 && (
            <Link href="/admin/setup" className="tc-btn-ghost tc-btn-sm">
              <span className="relative flex h-4 w-4 items-center justify-center">
                <svg viewBox="0 0 20 20" className="h-4 w-4 -rotate-90" aria-hidden="true">
                  <circle cx="10" cy="10" r="8" fill="none" stroke="#E5E7EB" strokeWidth="3" />
                  <circle cx="10" cy="10" r="8" fill="none" stroke="#0B0F14" strokeWidth="3" strokeDasharray={`${(setup.done / setup.total) * 50.3} 50.3`} />
                </svg>
              </span>
              Finish setup · {setup.done}/{setup.total}
            </Link>
          )}
          <Link href="/admin/schedule" className="tc-btn-dark tc-btn-sm">
            <Icon name="calendar" size={16} /> Open schedule
          </Link>
        </div>
      </div>

      {/* ---- Metric row ---- */}
      <section aria-label="Today" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="tc-card p-4 md:p-5">
            <p className="text-[13px] font-semibold text-tc-500">{t.label}</p>
            <p className="mt-1 font-tc-display text-[30px] font-extrabold leading-none tracking-[-0.03em] tabular-nums md:text-[36px]">{t.value}</p>
            <p className={`mt-2 text-[13px] ${t.tone === 'warn' ? 'font-semibold text-amber-700' : 'text-tc-500'}`}>{t.note}</p>
          </div>
        ))}
      </section>

      {/* On narrower screens the recommendations come first. */}
      <div className="xl:hidden">
        <Intelligence insights={home.insights} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.55fr_1fr]">
        {/* ---- Left: money + route ---- */}
        <div className="space-y-4">
          <section className="tc-card p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-[16px] font-bold">Revenue</h3>
              <p className="text-[13px] text-tc-500">
                Last 14 days · <span className="font-semibold text-tc-900 tabular-nums">{dollars(home.revenue14Cents)}</span> collected
              </p>
            </div>
            <div className="mt-4 hidden sm:block">
              <RevenueBars series={home.series} />
            </div>
            <div className="mt-4 sm:hidden">
              <RevenueBars series={home.series.slice(-7)} width={360} />
              <p className="mt-1 text-[12px] text-tc-500">Showing the last 7 days</p>
            </div>
          </section>

          <section className="tc-card">
            <div className="flex items-center justify-between px-5 pb-2 pt-5">
              <h3 className="text-[16px] font-bold">Today’s route</h3>
              <Link href="/admin/routes" className="text-[13px] font-semibold text-tc-700 underline decoration-tc-300 underline-offset-4 hover:decoration-tc-black">
                Plan routes
              </Link>
            </div>
            {home.route.length === 0 ? (
              <div className="px-5 pb-6 pt-2">
                <p className="text-[14px] text-tc-500">No cleans on the calendar today.</p>
                <Link href="/admin/series/new" className="tc-btn-ghost tc-btn-sm mt-3">
                  <Icon name="plus" size={15} /> Schedule a clean
                </Link>
              </div>
            ) : (
              <ul className="divide-y divide-tc-100">
                {home.route.map((r) => (
                  <li key={r.bookingId} className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3 gap-y-0.5 px-5 py-3 sm:grid-cols-[150px_1fr_auto_auto]">
                    <span className="col-span-3 whitespace-nowrap text-[13px] tabular-nums text-tc-500 sm:col-span-1">{formatSlotLabel(r.start, r.end)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold">{r.client}</span>
                      <span className={`block text-[12px] ${r.staffCount === 0 && r.status !== 'COMPLETE' ? 'font-semibold text-amber-700' : 'text-tc-500'}`}>
                        {r.staffCount === 0 && r.status !== 'COMPLETE' ? 'Nobody assigned' : `${r.crew ?? 'Team'} · ${r.staffCount} cleaner${r.staffCount === 1 ? '' : 's'}`}
                        {r.overMin > 0 ? ` · ${r.overMin} min over` : ''}
                      </span>
                    </span>
                    <span className={`tc-status ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span>
                    {r.jobId && (
                      <Link href={`/crew/jobs/${r.jobId}`} className="flex h-8 w-8 items-center justify-center rounded-lg text-tc-500 hover:bg-tc-100 hover:text-tc-black" aria-label={`Open ${r.client}’s clean`}>
                        <Icon name="chevron" size={16} />
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* ---- Right: intelligence, team, activity ---- */}
        <div className="space-y-4">
          <div className="hidden xl:block">
            <Intelligence insights={home.insights} />
          </div>
          <section className="tc-card p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-[16px] font-bold">Team today</h3>
              <Link href="/admin/team" className="text-[13px] font-semibold text-tc-700 underline decoration-tc-300 underline-offset-4 hover:decoration-tc-black">
                Team
              </Link>
            </div>
            {home.team.every((t) => t.jobs === 0) ? (
              <p className="mt-3 text-[14px] text-tc-500">No crews on jobs today.</p>
            ) : (
              <ul className="mt-4 space-y-4">
                {home.team
                  .filter((t) => t.jobs > 0)
                  .map((t) => (
                    <li key={t.id}>
                      <div className="flex justify-between text-[14px]">
                        <span className="font-semibold">{t.name}</span>
                        <span className="tabular-nums text-tc-500">
                          {t.done}/{t.jobs} done
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 rounded-full bg-tc-100" role="progressbar" aria-valuenow={t.pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${t.name} progress`}>
                        <div className="h-full rounded-full bg-tc-black transition-[width] duration-500" style={{ width: `${t.pct}%` }} />
                      </div>
                      {t.over > 0 && <p className="mt-1 text-[12px] font-semibold text-amber-700">{t.over} running over</p>}
                    </li>
                  ))}
              </ul>
            )}
          </section>

          <section className="tc-card p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-[16px] font-bold">Recent activity</h3>
              <Link href="/admin/activity" className="text-[13px] font-semibold text-tc-700 underline decoration-tc-300 underline-offset-4 hover:decoration-tc-black">
                All changes
              </Link>
            </div>
            {home.activity.length === 0 ? (
              <p className="mt-3 text-[14px] text-tc-500">Nothing changed in the last two weeks.</p>
            ) : (
              <ol className="mt-3 space-y-3">
                {home.activity.map((a) => (
                  <li key={a.id} className="flex gap-3 text-[13px]">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-tc-300" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="text-tc-900">
                        <strong className="font-semibold">{a.who}</strong> {a.summary}
                      </span>
                      <span className="block text-tc-500">{ago(a.at)}</span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {alerts.length > 0 && (
            <section className="tc-card p-5">
              <h3 className="mb-3 text-[16px] font-bold">From clients</h3>
              <AdminAlertsPanel alerts={alerts.slice(0, 5).map((a) => ({ id: a.id, triggerEvent: a.triggerEvent, createdAt: a.createdAt.toISOString() }))} />
            </section>
          )}
        </div>
      </div>

      {/* ---- Pipeline strip: every stage of the day ---- */}
      <section aria-labelledby="tc-pipeline">
        <h3 id="tc-pipeline" className="mb-3 text-[16px] font-bold">Pipeline</h3>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {strip.cards.map((card) => (
            <div key={card.key} className="tc-card flex flex-col p-5">
              <Link href={card.href} className="group">
                <p className="text-[13px] font-semibold text-tc-500 group-hover:text-tc-black">{card.title}</p>
                <p className="mt-1 font-tc-display text-[28px] font-extrabold tracking-[-0.03em] tabular-nums">{card.big}</p>
                <p className="text-[12px] text-tc-500">{card.caption}</p>
              </Link>
              <ul className="mt-4 space-y-1 border-t border-tc-100 pt-3">
                {card.links.map((l) => (
                  <li key={l.label}>
                    <Link href={l.href} className="flex min-h-[32px] items-center justify-between gap-3 rounded-md text-[13px] hover:text-tc-black">
                      <span className={l.hot ? 'font-semibold text-tc-900' : 'text-tc-700'}>{l.label}</span>
                      <span className={`min-w-[1.75rem] rounded-md px-1.5 py-0.5 text-center text-[12px] font-bold tabular-nums ${l.hot ? 'bg-tc-black text-tc-lime' : 'bg-tc-100 text-tc-500'}`}>
                        {l.count}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {strip.unassignedTotal > 0 && (
        <section className="rounded-tc-lg border border-amber-200 bg-amber-50 p-5">
          <h3 className="text-[15px] font-bold text-amber-900">
            {strip.unassignedTotal} upcoming clean{strip.unassignedTotal === 1 ? ' has' : 's have'} nobody assigned
          </h3>
          <ul className="mt-2 space-y-1 text-[14px] text-amber-900">
            {strip.unassigned.map((u) => (
              <li key={u.bookingId} className="flex justify-between gap-3">
                <span>{u.clientName}</span>
                <span className="tabular-nums">
                  {formatDateLabel(u.start.slice(0, 10))} · {formatSlotLabel(u.start, u.end)}
                </span>
              </li>
            ))}
          </ul>
          <Link href="/admin/schedule" className="mt-3 inline-flex text-[14px] font-semibold text-amber-900 underline underline-offset-4">
            Assign a team
          </Link>
        </section>
      )}
    </div>
  );
}

function Intelligence({ insights }: { insights: Insight[] }) {
  return (
          <section className="rounded-tc-lg border border-[#DDEFAA] bg-tc-lime-wash p-5" aria-label="TRASHCAN Intelligence">
            <h3  className="flex items-center gap-2 text-[14px] font-bold text-tc-lime-ink">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-tc-black text-tc-lime">
                <Icon name="bolt" size={13} />
              </span>
              TRASHCAN Intelligence
            </h3>
            {insights.length === 0 ? (
              <p className="mt-3 text-[14px] text-tc-900">All clear — nothing needs a decision right now.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {insights.map((i) => (
                  <li key={i.key}>
                    <Link href={i.href} className="group block rounded-tc-md bg-white p-3.5 ring-1 ring-[#E6F3B8] transition-shadow hover:shadow-tc">
                      <span className="flex items-start gap-2.5">
                        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TONE[i.tone]}`} aria-hidden="true" />
                        <span className="min-w-0">
                          <span className="block text-[14px] font-semibold leading-snug">{i.text}</span>
                          <span className="mt-1 inline-flex items-center gap-1 text-[13px] font-semibold text-tc-700 group-hover:text-tc-black">
                            {i.action} <Icon name="arrow" size={13} />
                          </span>
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
  );
}
