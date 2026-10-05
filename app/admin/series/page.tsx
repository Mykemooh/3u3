import Link from 'next/link';
import { getTenant } from '@/lib/data';
import { listSeries } from '@/lib/recurring';
import { formatMoney } from '@/lib/format';

export const dynamic = 'force-dynamic';

const STATUS = { ACTIVE: 'bg-green-light text-green', PAUSED: 'bg-amber-50 text-amber-800', ENDED: 'bg-surface text-muted' } as const;

export default async function SeriesListPage() {
  const tenant = await getTenant();
  if (!tenant) return null;
  const rows = await listSeries(tenant.id);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold text-ink">Recurring cleans</h2>
          <p className="text-slate">Every repeating clean. Move or skip one visit without touching the rest.</p>
        </div>
        <Link href="/admin/series/new" className="btn-primary btn-sm">Schedule a clean</Link>
      </div>
      <div className="card overflow-x-auto p-0">
        {rows.length === 0 ? (
          <p className="p-6 text-sm text-muted">No recurring cleans yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-5 py-3">Client</th>
                <th className="px-5 py-3">Schedule</th>
                <th className="px-5 py-3">Team</th>
                <th className="px-5 py-3">Next visit</th>
                <th className="px-5 py-3">Price</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((s) => (
                <tr key={s.id} className="hover:bg-surface/60">
                  <td className="px-5 py-3">
                    <Link href={`/admin/series/${s.id}`} className="font-semibold text-ink hover:text-bronze">{s.clientName}</Link>
                    <span className="block text-xs text-muted">{s.serviceName}</span>
                  </td>
                  <td className="px-5 py-3 text-slate">{s.describe}</td>
                  <td className="px-5 py-3 text-slate">{s.crewName}</td>
                  <td className="px-5 py-3 text-slate">{s.nextVisit ? s.nextVisit.replace('T', ' ').slice(0, 16) : '—'}</td>
                  <td className="px-5 py-3 text-slate">{s.priceCents != null ? formatMoney(s.priceCents) : '—'}</td>
                  <td className="px-5 py-3"><span className={`pill ${STATUS[s.status]}`}>{s.status.toLowerCase()}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
