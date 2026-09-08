import { db } from '@/db/client';
import { users, clientRates } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getTenant, getServiceTypes, formatMoney, SERVICE_LABELS } from '@/lib/data';
import RateForm from '@/components/RateForm';

export default async function AdminRatesPage() {
  const tenant = await getTenant();
  if (!tenant) return null;
  const services = await getServiceTypes(tenant.id);
  const customers = await db.select().from(users).where(eq(users.role, 'CUSTOMER'));

  const ratesByCustomer = await Promise.all(
    customers.map((c) => db.select().from(clientRates).where(eq(clientRates.userId, c.id))),
  );
  const rows = customers.flatMap((c, idx) =>
    ratesByCustomer[idx].map((r) => {
      const service = services.find((s) => s.id === r.serviceTypeId);
      return { client: c, service, rate: r };
    }),
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="mb-1 text-2xl font-bold text-ink">Client Rates</h1>
        <p className="text-ink/60">Every returning client's rate is pre-agreed per service — never a flat rate.</p>
      </div>

      <div className="card max-w-2xl">
        <h2 className="mb-4 font-semibold text-ink">Set or update a rate</h2>
        <RateForm services={services.map((s) => ({ id: s.id, name: s.name }))} />
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink/10 text-left text-ink/50">
              <th className="px-4 py-3 font-medium">Client</th>
              <th className="px-4 py-3 font-medium">Phone</th>
              <th className="px-4 py-3 font-medium">Service</th>
              <th className="px-4 py-3 font-medium">Agreed rate</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ client, service, rate }) => (
              <tr key={rate.id} className="border-b border-ink/5 last:border-0">
                <td className="px-4 py-3 font-medium">{client.name}</td>
                <td className="px-4 py-3 text-ink/70">{client.phone}</td>
                <td className="px-4 py-3 text-ink/70">{service ? SERVICE_LABELS[service.key] : '—'}</td>
                <td className="px-4 py-3 font-semibold text-bronze">{formatMoney(rate.rateCents)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-ink/40">
                  No rates on file yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
