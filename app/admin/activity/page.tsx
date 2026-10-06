import Link from 'next/link';
import { getTenant } from '@/lib/data';
import { recentActivity, fieldLabel, type AuditEntity } from '@/lib/audit';

const TYPES: { key: AuditEntity | 'all'; label: string }[] = [
  { key: 'all', label: 'Everything' },
  { key: 'booking', label: 'Bookings' },
  { key: 'series', label: 'Recurring' },
  { key: 'invoice', label: 'Invoices' },
  { key: 'quote', label: 'Quotes' },
  { key: 'client', label: 'Clients' },
  { key: 'team_member', label: 'Team' },
  { key: 'role', label: 'Roles' },
  { key: 'payroll_run', label: 'Payroll' },
  { key: 'settings', label: 'Settings' },
  { key: 'integration', label: 'Integrations' },
  { key: 'api_key', label: 'API keys' },
  { key: 'webhook', label: 'Webhooks' },
];

/** Change history across the company — who changed what, when. */
export default async function ActivityPage({ searchParams }: { searchParams: { type?: string; days?: string } }) {
  const tenant = await getTenant();
  if (!tenant) return null;
  const type = TYPES.find((t) => t.key === searchParams.type)?.key ?? 'all';
  const days = Math.min(365, Math.max(1, Number(searchParams.days) || 30));
  const rows = await recentActivity(tenant.id, { sinceDays: days, entityType: type === 'all' ? undefined : type });

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-2xl font-bold text-ink">Change history</h2>
        <p className="text-slate">Every edit to bookings, invoices, quotes, roles and settings, with who made it. Last {days} days.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {TYPES.map((t) => (
          <Link
            key={t.key}
            href={`/admin/activity?type=${t.key}&days=${days}`}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold ${type === t.key ? 'bg-ink text-white' : 'bg-white text-slate ring-1 ring-line hover:text-ink'}`}
          >
            {t.label}
          </Link>
        ))}
      </div>
      <div className="card">
        {rows.length === 0 ? (
          <p className="text-sm text-muted">Nothing changed in this period.</p>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm">
                <div>
                  <p className="text-ink"><span className="font-semibold">{r.actorName ?? 'System'}</span> · {r.summary}</p>
                  {r.changes.length > 0 && (
                    <p className="mt-0.5 text-xs text-muted">
                      {r.changes.map((c) => `${fieldLabel(c.field)}: ${c.from ?? '—'} → ${c.to ?? '—'}`).join(' · ')}
                    </p>
                  )}
                </div>
                <span className="text-xs text-muted">{r.createdAt.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
