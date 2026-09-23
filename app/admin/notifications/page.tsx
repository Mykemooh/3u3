import { getTenant, getNotificationLogForTenant } from '@/lib/data';

const STATUS_STYLE: Record<string, string> = {
  SENT: 'bg-emerald-100 text-emerald-700',
  FAILED: 'bg-red-100 text-red-700',
  RETRIED: 'bg-amber-100 text-amber-700',
};

// Notification cost log (PRD 3 / 6.6) — the success metric is "under
// $0.05 blended" cost per lead/booking notification.
export default async function AdminNotifications() {
  const tenant = await getTenant();
  if (!tenant) return null;
  const log = await getNotificationLogForTenant(tenant.id);

  const totalCostCents = log.reduce((sum, n) => sum + n.costCents, 0);
  const avgCostCents = log.length ? totalCostCents / log.length : 0;
  const target = 5; // cents

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-1 text-2xl font-bold text-ink">Notifications</h1>
        <p className="text-slate">Every email/SMS sent, and the blended cost against the PRD's $0.05 target.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="card">
          <p className="text-3xl font-black text-bronze">{log.length}</p>
          <p className="text-sm text-slate">Notifications sent</p>
        </div>
        <div className="card">
          <p className="text-3xl font-black text-bronze">${(totalCostCents / 100).toFixed(2)}</p>
          <p className="text-sm text-slate">Total cost</p>
        </div>
        <div className="card">
          <p className={`text-3xl font-black ${avgCostCents <= target ? 'text-emerald-600' : 'text-red-600'}`}>
            ${(avgCostCents / 100).toFixed(3)}
          </p>
          <p className="text-sm text-slate">Avg. cost per notification (target ≤ $0.05)</p>
        </div>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-muted">
              <th className="px-4 py-3 font-medium">When</th>
              <th className="px-4 py-3 font-medium">Channel</th>
              <th className="px-4 py-3 font-medium">Trigger</th>
              <th className="px-4 py-3 font-medium">Recipient</th>
              <th className="px-4 py-3 font-medium">Cost</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {log.map((n) => (
              <tr key={n.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3 text-slate">{n.createdAt.toLocaleString()}</td>
                <td className="px-4 py-3">{n.channel}</td>
                <td className="px-4 py-3 text-slate">{n.triggerEvent.replaceAll('_', ' ').toLowerCase()}</td>
                <td className="px-4 py-3 text-slate">{n.recipient}</td>
                <td className="px-4 py-3 text-slate">${(n.costCents / 100).toFixed(3)}</td>
                <td className="px-4 py-3"><span className={`pill ${STATUS_STYLE[n.status]}`}>{n.status}</span></td>
              </tr>
            ))}
            {log.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted">No notifications logged yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
