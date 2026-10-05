import { historyFor, fieldLabel, type AuditEntity } from '@/lib/audit';

function show(v: unknown) {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'number' && Math.abs(v) >= 100 && Number.isInteger(v)) return String(v);
  return String(v);
}

/** "History" on any record: who changed what, newest first. */
export default async function HistoryPanel({ tenantId, entityType, entityId, title = 'History' }: { tenantId: string; entityType: AuditEntity; entityId: string; title?: string }) {
  const rows = await historyFor(tenantId, entityType, entityId);
  return (
    <section className="card">
      <h3 className="mb-3 font-semibold text-ink">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">No changes recorded yet.</p>
      ) : (
        <ol className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="text-sm">
              <p className="text-ink">
                <span className="font-semibold">{r.actorName ?? 'System'}</span> {r.summary.charAt(0).toLowerCase() + r.summary.slice(1)}
              </p>
              <p className="text-xs text-muted">{r.createdAt.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</p>
              {r.changes.length > 0 && (
                <ul className="mt-1 space-y-0.5 text-xs text-slate">
                  {r.changes.map((c, i) => (
                    <li key={i}>
                      {fieldLabel(c.field)}: <span className="line-through decoration-muted">{show(c.from)}</span> → <span className="font-semibold text-ink">{show(c.to)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
