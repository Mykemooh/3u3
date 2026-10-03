import { getTenant } from '@/lib/data';
import { getSupplyReportsForTenant, SUPPLY_STATUS_LABELS } from '@/lib/supplies';
import ResolveSupplyButton from '@/components/admin/ResolveSupplyButton';

export const dynamic = 'force-dynamic';

const STATUS_STYLE: Record<string, string> = {
  LOW: 'bg-amber-100 text-amber-700',
  OUT: 'bg-red-100 text-red-700',
  DAMAGED: 'bg-red-100 text-red-700',
};

export default async function AdminSupplies() {
  const tenant = await getTenant();
  if (!tenant) return null;
  const [open, resolved] = await Promise.all([
    getSupplyReportsForTenant(tenant.id, false),
    getSupplyReportsForTenant(tenant.id, true).then((rows) => rows.filter((r) => r.report.resolved).slice(0, 20)),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="mb-1 text-2xl font-bold text-ink">Supplies</h1>
        <p className="text-slate">What crews have flagged as low, out, or damaged — straight from the crew portal.</p>
      </div>

      <div className="space-y-3">
        {open.map(({ report, reporterName, crewName }) => (
          <div key={report.id} className="card flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-ink">{report.productName}</span>
                <span className={`pill ${STATUS_STYLE[report.status]}`}>{SUPPLY_STATUS_LABELS[report.status as 'LOW' | 'OUT' | 'DAMAGED']}</span>
              </div>
              <p className="mt-1 text-sm text-slate">
                {crewName} · reported by {reporterName} · {report.createdAt.toLocaleDateString()}
              </p>
              {report.notes && <p className="mt-1 text-sm text-muted">"{report.notes}"</p>}
            </div>
            <ResolveSupplyButton reportId={report.id} />
          </div>
        ))}
        {open.length === 0 && <div className="card text-center text-muted">Nothing outstanding — all caught up.</div>}
      </div>

      {resolved.length > 0 && (
        <div>
          <h2 className="mb-3 font-semibold text-muted">Recently resolved</h2>
          <div className="space-y-2">
            {resolved.map(({ report, reporterName, crewName }) => (
              <div key={report.id} className="flex items-center justify-between rounded-xl border border-line px-4 py-3 text-sm opacity-70">
                <span>
                  {report.productName} — {crewName} ({reporterName})
                </span>
                <span className="pill bg-emerald-100 text-green">Resolved</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
