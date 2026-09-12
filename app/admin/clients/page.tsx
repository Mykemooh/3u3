import Link from 'next/link';
import { db } from '@/db/client';
import { addresses, clientRates, bookings as bookingsTable } from '@/db/schema';
import { inArray } from 'drizzle-orm';
import { getTenant, getClientsForTenant } from '@/lib/data';
import NewClientForm from '@/components/NewClientForm';

export default async function AdminClients() {
  const tenant = await getTenant();
  if (!tenant) return null;
  const clients = await getClientsForTenant(tenant.id);
  const clientIds = clients.map((c) => c.id);

  const addressRows = clientIds.length
    ? await db.select().from(addresses).where(inArray(addresses.userId, clientIds))
    : [];
  const rateRows = clientIds.length
    ? await db.select().from(clientRates).where(inArray(clientRates.userId, clientIds))
    : [];
  const bookingRows = clientIds.length
    ? await db.select().from(bookingsTable).where(inArray(bookingsTable.clientId, clientIds))
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-1 text-2xl font-bold text-ink">Clients</h1>
        <p className="text-ink/60">Every customer on file, with their rates and history.</p>
      </div>

      <NewClientForm />

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink/10 text-left text-ink/50">
              <th className="px-4 py-3 font-medium">Client</th>
              <th className="px-4 py-3 font-medium">Contact</th>
              <th className="px-4 py-3 font-medium">Address</th>
              <th className="px-4 py-3 font-medium">Rates on file</th>
              <th className="px-4 py-3 font-medium">Bookings</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => {
              const address = addressRows.find((a) => a.userId === c.id);
              const rateCount = rateRows.filter((r) => r.userId === c.id).length;
              const bookingCount = bookingRows.filter((b) => b.clientId === c.id).length;
              return (
                <tr key={c.id} className="border-b border-ink/5 last:border-0">
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/admin/clients/${c.id}`} className="hover:text-bronze hover:underline">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink/70">
                    {c.phone}
                    {c.email && <span className="block text-xs text-ink/40">{c.email}</span>}
                  </td>
                  <td className="px-4 py-3 text-ink/70">{address ? `${address.line1}, ${address.city}` : '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`pill ${rateCount > 0 ? 'bg-gold/15 text-bronze' : 'bg-ink/5 text-ink/40'}`}>
                      {rateCount} {rateCount === 1 ? 'service' : 'services'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-ink/70">{bookingCount}</td>
                </tr>
              );
            })}
            {clients.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-ink/40">
                  No clients yet — add one, or wait for a lead to come in.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
