import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getTenant, getUnreadAdminAlerts } from '@/lib/data';
import AdminAlertsPanel from '@/components/AdminAlertsPanel';
import ProgressRing from '@/components/admin/ProgressRing';
import { businessTodayISO } from '@/lib/time';
import { formatDateLabel, formatSlotLabel } from '@/lib/scheduling';
import { getAdminToday, type TodayVisit } from '@/lib/adminToday';
import { setupProgress } from '@/lib/setupGuide';

const STATUS: Record<TodayVisit['status'], { label: string; cls: string }> = {
  PENDING: { label: 'Scheduled', cls: 'bg-surface text-slate' },
  EN_ROUTE: { label: 'On the way', cls: 'bg-gold/10 text-bronze' },
  IN_PROGRESS: { label: 'Cleaning now', cls: 'bg-green-light text-green' },
  COMPLETE: { label: 'Done', cls: 'bg-green text-white' },
  QUOTE_VISIT: { label: 'Walkthrough', cls: 'bg-cream text-bronze ring-1 ring-line' },
};

function greeting() {
  const hour = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: process.env.BUSINESS_TIMEZONE || 'America/Chicago' }).format(new Date()));
  return hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening';
}

/**
 * The Admin portal's landing page: a workflow strip in the order a
 * cleaning day runs (today's cleans → new bookings → quotes → unpaid), each
 * with what needs attention, then today's visits and anything unassigned.
 */
export default async function AdminToday() {
  const tenant = await getTenant();
  if (!tenant) return null;
  const session = await getServerSession(authOptions);
  const firstName = (session?.user?.name ?? '').split(/[\s(]/)[0];
  const [data, alerts, setup] = await Promise.all([getAdminToday(tenant.id), getUnreadAdminAlerts(tenant.id), setupProgress(tenant.id)]);
  const today = businessTodayISO();
  const homes = data.visits.filter((v) => !v.isQuoteVisit).length;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">{formatDateLabel(today)}</p>
          <h2 className="mt-1 font-display text-2xl font-bold text-ink md:text-3xl">
            {greeting()}{firstName ? `, ${firstName}` : ''}. {homes === 0 ? 'No homes on the calendar today.' : `${homes} home${homes === 1 ? '' : 's'} today.`}
          </h2>
        </div>
        {setup.remaining > 0 && (
          <Link href="/admin/setup" className="rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-bronze hover:border-gold">
            Finish setup · {setup.done}/{setup.total}
          </Link>
        )}
      </div>

      <section aria-label="Workflow" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {data.cards.map((card) => (
          <div key={card.key} className="relative overflow-hidden rounded-2xl border border-line bg-white p-5">
            <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1" style={{ backgroundImage: 'linear-gradient(90deg, #016AEE, #2DBD91)' }} />
            <div className="flex items-start justify-between gap-3">
              <Link href={card.href} className="group">
                <p className="text-sm font-semibold text-slate group-hover:text-bronze">{card.title}</p>
                <p className="mt-1 font-display text-4xl font-extrabold tracking-tight text-ink">{card.big}</p>
                <p className="text-xs text-muted">{card.caption}</p>
              </Link>
              {card.progress != null && (
                <div className="flex flex-col items-center">
                  <ProgressRing value={card.progress} label={card.progressLabel} />
                  {card.progressLabel && <span className="mt-1 max-w-[90px] text-center text-[10px] leading-tight text-muted">{card.progressLabel}</span>}
                </div>
              )}
            </div>
            <ul className="mt-4 space-y-1.5 border-t border-line pt-3">
              {card.links.map((l) => (
                <li key={l.label}>
                  <Link href={l.href} className="flex items-center justify-between text-sm hover:text-bronze">
                    <span className={l.hot ? 'font-semibold text-ink' : 'text-slate'}>{l.label}</span>
                    <span className={`min-w-[1.75rem] rounded-full px-2 py-0.5 text-center text-xs font-bold ${l.hot ? 'bg-amber-100 text-amber-800' : 'bg-surface text-muted'}`}>
                      {l.count}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      {data.unassignedTotal > 0 && (
        <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5">
          <h3 className="font-semibold text-amber-900">
            {data.unassignedTotal} upcoming clean{data.unassignedTotal === 1 ? ' has' : 's have'} no one assigned
          </h3>
          <ul className="mt-2 space-y-1 text-sm text-amber-900">
            {data.unassigned.map((u) => (
              <li key={u.bookingId} className="flex justify-between gap-3">
                <span>{u.clientName}</span>
                <span>{formatDateLabel(u.start.slice(0, 10))} · {formatSlotLabel(u.start, u.end)}</span>
              </li>
            ))}
          </ul>
          <Link href="/admin/schedule" className="mt-3 inline-block text-sm font-semibold text-amber-900 underline">Assign a team</Link>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold text-ink">Today's visits</h3>
            <Link href="/admin/schedule" className="text-sm font-semibold text-bronze hover:underline">Open calendar</Link>
          </div>
          {data.visits.length === 0 ? (
            <p className="text-sm text-muted">Nothing booked today.</p>
          ) : (
            <ul className="divide-y divide-line">
              {data.visits.map((v) => (
                <li key={v.bookingId} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                  <div className="flex items-center gap-3">
                    <span className="w-36 shrink-0 whitespace-nowrap text-muted">{formatSlotLabel(v.start, v.end)}</span>
                    <span className="font-semibold text-ink">{v.clientName}</span>
                    {v.late && <span className="pill bg-red-50 text-red-700">Late</span>}
                  </div>
                  <div className="flex items-center gap-3">
                    {!v.isQuoteVisit && (
                      <span className={`text-xs ${v.staffCount === 0 ? 'font-semibold text-amber-700' : 'text-muted'}`}>
                        {v.staffCount === 0 ? 'No one assigned' : `${v.crewName ?? 'Team'} · ${v.staffCount} cleaner${v.staffCount === 1 ? '' : 's'}`}
                      </span>
                    )}
                    <span className={`pill ${STATUS[v.status].cls}`}>{STATUS[v.status].label}</span>
                    {v.jobId && (
                      <Link href={`/crew/jobs/${v.jobId}`} className="font-semibold text-bronze hover:underline">Open</Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h3 className="mb-3 font-semibold text-ink">Alerts</h3>
          {alerts.length === 0 ? (
            <p className="text-sm text-muted">Nothing new from clients.</p>
          ) : (
            <AdminAlertsPanel alerts={alerts.map((a) => ({ id: a.id, triggerEvent: a.triggerEvent, createdAt: a.createdAt.toISOString() }))} />
          )}
        </section>
      </div>
    </div>
  );
}
