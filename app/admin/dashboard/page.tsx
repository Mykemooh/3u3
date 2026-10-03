import { getTenant, formatMoney } from '@/lib/data';
import { businessTodayISO } from '@/lib/time';
import {
  getDashboardSettings, getRevenueByTeam, getRevenueByCleaner, getProfitPerClean,
  getRevenueByZip, getRetention, getPortfolioGrowth, WIDGET_KEYS, WIDGET_LABELS, type WidgetKey,
} from '@/lib/dashboard';
import DashboardCustomizeForm from '@/components/admin/DashboardCustomizeForm';

export const dynamic = 'force-dynamic';

function daysAgoISO(days: number) {
  const d = new Date(businessTodayISO());
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function Bar({ fraction }: { fraction: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
      <div className="h-full rounded-full bg-gold" style={{ width: `${Math.max(0, Math.min(100, fraction * 100))}%` }} />
    </div>
  );
}

export default async function AdminDashboard({ searchParams }: { searchParams: { start?: string; end?: string } }) {
  const tenant = await getTenant();
  if (!tenant) return null;

  const start = searchParams.start || daysAgoISO(30);
  const end = searchParams.end || businessTodayISO();
  const settings = await getDashboardSettings(tenant.id);
  const visible = (key: WidgetKey) => !settings.hiddenWidgets.includes(key);

  const [teamRevenue, cleanerRevenue, profit, zipRevenue, retention, portfolio] = await Promise.all([
    visible('revenue_by_team') ? getRevenueByTeam(tenant.id, start, end) : Promise.resolve([]),
    visible('revenue_by_team') ? getRevenueByCleaner(tenant.id, start, end) : Promise.resolve([]),
    visible('profit_per_clean') ? getProfitPerClean(tenant.id, start, end, settings.avgSupplyCostCents) : Promise.resolve(null),
    visible('revenue_by_zip') ? getRevenueByZip(tenant.id, start, end) : Promise.resolve([]),
    visible('retention') ? getRetention(tenant.id) : Promise.resolve(null),
    visible('portfolio_growth') ? getPortfolioGrowth(tenant.id, 12) : Promise.resolve([]),
  ]);

  const maxTeamRevenue = Math.max(1, ...teamRevenue.map((r) => r.revenueCents));
  const maxZipRevenue = Math.max(1, ...zipRevenue.map((r) => r.revenueCents));
  const maxPortfolioRevenue = Math.max(1, ...portfolio.map((p) => p.revenueCents));
  const maxPortfolioHomes = Math.max(1, ...portfolio.map((p) => p.homes));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Admin</p>
          <h1 className="mt-1 text-3xl font-extrabold">Dashboard</h1>
          <p className="mt-2 text-slate">Revenue, profit, and growth — pick which of these you want to see.</p>
        </div>
        <DashboardCustomizeForm
          widgets={WIDGET_KEYS.map((key) => ({ key, label: WIDGET_LABELS[key] }))}
          initialHidden={settings.hiddenWidgets}
          initialSupplyCostCents={settings.avgSupplyCostCents}
        />
      </div>

      <form className="card flex flex-wrap items-end gap-3" method="get">
        <div>
          <label className="label">From</label>
          <input type="date" name="start" defaultValue={start} className="input" />
        </div>
        <div>
          <label className="label">To</label>
          <input type="date" name="end" defaultValue={end} className="input" />
        </div>
        <button type="submit" className="btn-secondary">Apply</button>
        <p className="w-full text-xs text-muted">Affects revenue, profit, and zip code widgets — retention and portfolio growth are always all-time / trailing 12 months.</p>
      </form>

      {visible('revenue_by_team') && (
        <div className="card">
          <h2 className="mb-1 font-semibold text-ink">Revenue by team / cleaner</h2>
          <p className="mb-4 text-sm text-slate">Paid invoices for cleanings in this period, split evenly across whoever was staffed.</p>
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">By team</h3>
              <div className="space-y-3">
                {teamRevenue.map((r) => (
                  <div key={r.crewId}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium text-ink">{r.crewName}</span>
                      <span className="tabular-nums text-slate">{formatMoney(r.revenueCents)} · {r.cleans} cleans</span>
                    </div>
                    <Bar fraction={r.revenueCents / maxTeamRevenue} />
                  </div>
                ))}
                {teamRevenue.length === 0 && <p className="text-sm text-muted">No revenue in this period.</p>}
              </div>
            </div>
            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">By cleaner</h3>
              <div className="space-y-2">
                {cleanerRevenue.map((r) => (
                  <div key={r.userId} className="flex items-center justify-between border-b border-line py-1.5 text-sm last:border-0">
                    <span className="text-ink">{r.name}</span>
                    <span className="tabular-nums text-slate">{formatMoney(r.revenueCents)}</span>
                  </div>
                ))}
                {cleanerRevenue.length === 0 && <p className="text-sm text-muted">No revenue in this period.</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {visible('profit_per_clean') && profit && (
        <div className="card">
          <h2 className="mb-1 font-semibold text-ink">Profit per clean</h2>
          <p className="mb-4 text-sm text-slate">
            An estimate, not precise accounting — average revenue minus average labor cost minus your configured supply-cost assumption
            (${(profit.supplyCostCentsPerClean / 100).toFixed(2)}/clean, set under Customize). Based on {profit.cleans} paid clean{profit.cleans === 1 ? '' : 's'} in this period.
          </p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-muted">Revenue</p>
              <p className="text-xl font-bold tabular-nums text-ink">{formatMoney(profit.revenuePerCleanCents)}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-muted">Labor cost</p>
              <p className="text-xl font-bold tabular-nums text-ink">{formatMoney(profit.laborCostPerCleanCents)}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-muted">Supplies (est.)</p>
              <p className="text-xl font-bold tabular-nums text-ink">{formatMoney(profit.supplyCostCentsPerClean)}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-muted">Profit</p>
              <p className={`text-xl font-bold tabular-nums ${profit.profitPerCleanCents >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                {formatMoney(profit.profitPerCleanCents)}
              </p>
            </div>
          </div>
        </div>
      )}

      {visible('revenue_by_zip') && (
        <div className="card">
          <h2 className="mb-1 font-semibold text-ink">Revenue by zip code</h2>
          <p className="mb-4 text-sm text-slate">Where your paid revenue is coming from this period.</p>
          <div className="space-y-3">
            {zipRevenue.map((r) => (
              <div key={r.zip}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-medium text-ink">{r.zip}</span>
                  <span className="tabular-nums text-slate">{formatMoney(r.revenueCents)} · {r.cleans} cleans</span>
                </div>
                <Bar fraction={r.revenueCents / maxZipRevenue} />
              </div>
            ))}
            {zipRevenue.length === 0 && <p className="text-sm text-muted">No revenue in this period.</p>}
          </div>
        </div>
      )}

      {visible('retention') && retention && (
        <div className="card">
          <h2 className="mb-1 font-semibold text-ink">Client retention</h2>
          <p className="mb-4 text-sm text-slate">All-time — the share of clients who've booked more than once.</p>
          <div className="flex items-center gap-6">
            <p className="text-3xl font-extrabold text-ink">{retention.retentionRatePct}%</p>
            <p className="text-sm text-slate">
              {retention.repeatClients} of {retention.totalClients} client{retention.totalClients === 1 ? '' : 's'} have booked 2+ times
            </p>
          </div>
        </div>
      )}

      {visible('portfolio_growth') && (
        <div className="card overflow-x-auto">
          <h2 className="mb-1 font-semibold text-ink">Portfolio growth</h2>
          <p className="mb-4 text-sm text-slate">Homes served and revenue, trailing 12 months.</p>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b-2 border-ink text-xs uppercase tracking-wide text-muted">
                <th className="pb-2 font-bold">Month</th>
                <th className="pb-2 font-bold">Homes</th>
                <th className="pb-2 font-bold">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {portfolio.map((p) => (
                <tr key={p.month} className="border-b border-line last:border-0">
                  <td className="py-2 font-medium text-ink">{p.month}</td>
                  <td className="py-2">
                    <div className="flex items-center gap-2">
                      <span className="w-8 tabular-nums text-slate">{p.homes}</span>
                      <div className="w-24"><Bar fraction={p.homes / maxPortfolioHomes} /></div>
                    </div>
                  </td>
                  <td className="py-2">
                    <div className="flex items-center gap-2">
                      <span className="w-20 tabular-nums text-slate">{formatMoney(p.revenueCents)}</span>
                      <div className="w-24"><Bar fraction={p.revenueCents / maxPortfolioRevenue} /></div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
