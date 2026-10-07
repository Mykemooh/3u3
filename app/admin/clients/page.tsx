import Link from 'next/link';
import { db } from '@/db/client';
import { addresses, clientRates, bookings as bookingsTable } from '@/db/schema';
import { inArray } from 'drizzle-orm';
import { getTenant, getClientsForTenant } from '@/lib/data';
import NewClientForm from '@/components/NewClientForm';

export default async function AdminClients({ searchParams }: { searchParams: { q?: string; new?: string } }) {
  const tenant = await getTenant();
  if (!tenant) return null;
  // The workspace search bar (AdminShell) lands here with ?q=.
  const q = (searchParams.q ?? '').trim().toLowerCase();
  const qDigits = q.replace(/\D/g, '');
  const all = await getClientsForTenant(tenant.id);
  const clients = q
    ? all.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.email ?? '').toLowerCase().includes(q) ||
          (qDigits.length >= 3 && (c.phone ?? '').replace(/\D/g, '').includes(qDigits)),
      )
    : all;
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
        <p className="text-slate">Every customer on file, with their rates and history.</p>
      </div>

      {q && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-slate">
            {clients.length} match{clients.length === 1 ? '' : 'es'} for <strong className="text-ink">“{searchParams.q}”</strong>
          </span>
          <Link href="/admin/clients" className="font-semibold text-ink underline decoration-line underline-offset-4 hover:decoration-ink">
            Clear search
          </Link>
        </div>
      )}

      <NewClientForm startOpen={searchParams.new === '1'} />

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-muted">
              <th className="px-4 py-3 font-medium">Client</th>
              <th className="px-4 py-3 font-medium">Contact</th>
              <th className="px-4 py-3 font-medium">Address</th>
              <th className="px-4 py-3 font-medium">Rates on file</th>
              <th className="px-4 py-3 font-medium">Bookings</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => {
              const address = addressRows.find((a) => a.userId === c.id);
              const rateCount = rateRows.filter((r) => r.userId === c.id).length;
              const bookingCount = bookingRows.filter((b) => b.clientId === c.id).length;
              return (
                <tr key={c.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/admin/clients/${c.id}`} className="hover:text-bronze hover:underline">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate">
                    {c.phone}
                    {c.email && <span className="block text-xs text-muted">{c.email}</span>}
                  </td>
                  <td className="px-4 py-3 text-slate">{address ? `${address.line1}, ${address.city}` : '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`pill ${rateCount > 0 ? 'bg-gold/15 text-bronze' : 'bg-surface text-muted'}`}>
                      {rateCount} {rateCount === 1 ? 'service' : 'services'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate">{bookingCount}</td>
                  <td className="px-4 py-3">
                    <span className={`pill ${c.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                      {c.isActive ? 'Active' : 'Closed'}
                    </span>
                  </td>
                </tr>
              );
            })}
            {clients.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted">
                  {q ? 'No clients match that search.' : 'No clients yet — add one, or wait for a lead to come in.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
