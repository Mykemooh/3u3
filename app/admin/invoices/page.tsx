import Link from 'next/link';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { inArray } from 'drizzle-orm';
import { getTenant, getAllInvoicesForTenant, formatMoney } from '@/lib/data';

const STATUS_STYLE: Record<string, string> = {
  DRAFT: 'bg-surface text-slate',
  SENT: 'bg-amber-100 text-amber-700',
  PAID: 'bg-emerald-100 text-emerald-700',
  VOID: 'bg-red-100 text-red-700',
};

// The tail end of quote → job → invoice → payment → receipt. One row per
// completed job's invoice, from auto-drafted through paid.
export default async function AdminInvoices() {
  const tenant = await getTenant();
  if (!tenant) return null;
  const invoiceRows = await getAllInvoicesForTenant(tenant.id);

  const clientIds = [...new Set(invoiceRows.map((i) => i.clientId))];
  const clients = clientIds.length ? await db.select().from(users).where(inArray(users.id, clientIds)) : [];
  const clientMap = Object.fromEntries(clients.map((c) => [c.id, c]));

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-ink">Invoices</h1>
      <p className="mb-6 text-slate">
        Auto-drafted the moment a job is marked complete. Review, send, and track payment here.
      </p>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-muted">
              <th className="px-4 py-3 font-medium">Client</th>
              <th className="px-4 py-3 font-medium">Amount</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Created</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {invoiceRows.map((inv) => {
              const client = clientMap[inv.clientId];
              return (
                <tr key={inv.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-medium">{client?.name ?? '—'}</td>
                  <td className="px-4 py-3">{formatMoney(inv.totalCents)}</td>
                  <td className="px-4 py-3">
                    <span className={`pill ${STATUS_STYLE[inv.status]}`}>{inv.status}</span>
                  </td>
                  <td className="px-4 py-3 text-slate">{inv.createdAt.toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/invoices/${inv.id}`} className="text-sm font-semibold text-bronze hover:underline">
                      {inv.status === 'DRAFT' ? 'Review & send →' : 'View →'}
                    </Link>
                  </td>
                </tr>
              );
            })}
            {invoiceRows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted">
                  No invoices yet — completing a cleaning job drafts one automatically.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
