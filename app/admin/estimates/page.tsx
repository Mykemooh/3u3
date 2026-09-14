import Link from 'next/link';
import { db } from '@/db/client';
import { users, serviceTypes } from '@/db/schema';
import { inArray } from 'drizzle-orm';
import { getTenant, formatMoney } from '@/lib/data';
import { getEstimatesForTenant } from '@/lib/estimates';

const STATUS_STYLE: Record<string, string> = {
  DRAFT: 'bg-ink/5 text-ink/60',
  SENT: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-emerald-100 text-emerald-700',
  DECLINED: 'bg-red-100 text-red-700',
  EXPIRED: 'bg-ink/10 text-ink/50',
};

export default async function AdminEstimates() {
  const tenant = await getTenant();
  if (!tenant) return null;
  const estimates = await getEstimatesForTenant(tenant.id);

  const clientIds = [...new Set(estimates.map((e) => e.clientId))];
  const clients = clientIds.length ? await db.select().from(users).where(inArray(users.id, clientIds)) : [];
  const clientMap = Object.fromEntries(clients.map((c) => [c.id, c]));

  const serviceIds = [...new Set(estimates.map((e) => e.serviceTypeId))];
  const services = serviceIds.length
    ? await db.select().from(serviceTypes).where(inArray(serviceTypes.id, serviceIds))
    : [];
  const serviceMap = Object.fromEntries(services.map((s) => [s.id, s.name]));

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-ink">Estimates</h1>
      <p className="mb-6 text-ink/60">
        What you quote after a walkthrough. Approving one puts the price on file and lets the client book
        themselves.
      </p>

      <div className="grid grid-cols-1 gap-3">
        {estimates.map((estimate) => {
          const client = clientMap[estimate.clientId];
          return (
            <Link
              key={estimate.id}
              href={`/admin/estimates/${estimate.id}`}
              className="card flex items-center justify-between transition hover:border-gold"
            >
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-ink">{client?.name ?? 'Unknown client'}</p>
                  <span className={`pill ${STATUS_STYLE[estimate.status]}`}>{estimate.status}</span>
                </div>
                <p className="text-sm text-ink/60">{serviceMap[estimate.serviceTypeId] ?? 'Cleaning service'}</p>
                <p className="text-sm text-ink/40">
                  {estimate.sentAt ? `Sent ${estimate.sentAt.toLocaleDateString()}` : 'Not sent yet'}
                </p>
              </div>
              <span className="text-lg font-bold text-ink">{formatMoney(estimate.totalCents)}</span>
            </Link>
          );
        })}
        {estimates.length === 0 && (
          <div className="card text-center text-ink/40">
            No estimates yet — start one from a lead after you've done the walkthrough.
          </div>
        )}
      </div>
    </div>
  );
}
