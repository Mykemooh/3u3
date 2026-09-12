import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/db/client';
import { addresses, clientRates, bookings as bookingsTable } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getTenant, getUserById, getServiceTypes, formatMoney, SERVICE_LABELS } from '@/lib/data';
import ClientRateForm from '@/components/ClientRateForm';

const STATUS_STYLE: Record<string, string> = {
  REQUESTED: 'bg-amber-100 text-amber-700',
  CONFIRMED: 'bg-emerald-100 text-emerald-700',
  COMPLETED: 'bg-blue-100 text-blue-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

export default async function ClientDetailPage({ params }: { params: { id: string } }) {
  const tenant = await getTenant();
  if (!tenant) return null;
  const client = await getUserById(params.id);
  if (!client || client.role !== 'CUSTOMER') notFound();

  const clientAddresses = await db.select().from(addresses).where(eq(addresses.userId, client.id));
  const rates = await db.select().from(clientRates).where(eq(clientRates.userId, client.id));
  const services = await getServiceTypes(tenant.id);
  const serviceMap = Object.fromEntries(services.map((s) => [s.id, s]));
  const clientBookings = (await db.select().from(bookingsTable).where(eq(bookingsTable.clientId, client.id))).sort(
    (a, b) => b.slotStart.localeCompare(a.slotStart),
  );

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/clients" className="text-sm text-ink/50 hover:text-ink">← All clients</Link>
        <h1 className="mt-2 text-2xl font-bold text-ink">{client.name}</h1>
        <p className="text-ink/60">
          {client.phone} {client.email ? `· ${client.email}` : ''}
        </p>
      </div>

      <div className="card max-w-xl">
        <h2 className="mb-3 font-semibold text-ink">Addresses</h2>
        {clientAddresses.length === 0 && <p className="text-sm text-ink/50">No address on file.</p>}
        <ul className="space-y-1">
          {clientAddresses.map((a) => (
            <li key={a.id} className="text-sm text-ink/70">{a.line1}, {a.city}, {a.state} {a.zip ?? ''}</li>
          ))}
        </ul>
      </div>

      <div className="card max-w-2xl">
        <h2 className="mb-4 font-semibold text-ink">Agreed rates</h2>
        <div className="mb-4 space-y-2">
          {rates.map((r) => (
            <div key={r.id} className="flex items-center justify-between border-b border-ink/5 py-2 text-sm last:border-0">
              <span className="font-medium">{serviceMap[r.serviceTypeId] ? SERVICE_LABELS[serviceMap[r.serviceTypeId].key] : '—'}</span>
              <span className="font-semibold text-bronze">{formatMoney(r.rateCents)}</span>
            </div>
          ))}
          {rates.length === 0 && <p className="text-sm text-ink/50">No rates on file yet — set one below.</p>}
        </div>
        <ClientRateForm clientId={client.id} services={services.map((s) => ({ id: s.id, name: s.name }))} />
      </div>

      <div className="card overflow-x-auto p-0">
        <h2 className="px-4 pt-4 font-semibold text-ink">Booking history</h2>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="border-b border-ink/10 text-left text-ink/50">
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">When</th>
              <th className="px-4 py-3 font-medium">Cadence</th>
              <th className="px-4 py-3 font-medium">Price</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {clientBookings.map((b) => {
              const service = b.serviceTypeId ? serviceMap[b.serviceTypeId] : null;
              return (
                <tr key={b.id} className="border-b border-ink/5 last:border-0">
                  <td className="px-4 py-3">{b.isQuoteVisit ? 'Quote visit' : service ? SERVICE_LABELS[service.key] : '—'}</td>
                  <td className="px-4 py-3 text-ink/70">{b.slotStart.replace('T', ' ')}</td>
                  <td className="px-4 py-3 text-ink/70">{b.cadence.replace('_', ' ').toLowerCase()}</td>
                  <td className="px-4 py-3 text-ink/70">{formatMoney(b.priceCents)}</td>
                  <td className="px-4 py-3"><span className={`pill ${STATUS_STYLE[b.status]}`}>{b.status}</span></td>
                </tr>
              );
            })}
            {clientBookings.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-ink/40">No bookings yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
