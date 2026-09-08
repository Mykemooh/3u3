import { db } from '@/db/client';
import { users, serviceTypes } from '@/db/schema';
import { getTenant, getAllBookings, formatMoney, SERVICE_LABELS } from '@/lib/data';

const STATUS_STYLE: Record<string, string> = {
  REQUESTED: 'bg-amber-100 text-amber-700',
  CONFIRMED: 'bg-emerald-100 text-emerald-700',
  COMPLETED: 'bg-blue-100 text-blue-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

export default async function AdminBookings() {
  const tenant = await getTenant();
  if (!tenant) return null;
  const bookings = await getAllBookings(tenant.id);
  const allUsers = await db.select().from(users);
  const allServices = await db.select().from(serviceTypes);

  const userMap = Object.fromEntries(allUsers.map((u) => [u.id, u]));
  const serviceMap = Object.fromEntries(allServices.map((s) => [s.id, s]));

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-ink">Bookings</h1>
      <p className="mb-6 text-ink/60">Every quote visit and cleaning job on the books.</p>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink/10 text-left text-ink/50">
              <th className="px-4 py-3 font-medium">Client</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">When</th>
              <th className="px-4 py-3 font-medium">Cadence</th>
              <th className="px-4 py-3 font-medium">Price</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {bookings.map((b) => {
              const client = userMap[b.clientId];
              const service = b.serviceTypeId ? serviceMap[b.serviceTypeId] : null;
              return (
                <tr key={b.id} className="border-b border-ink/5 last:border-0">
                  <td className="px-4 py-3 font-medium">{client?.name ?? '—'}</td>
                  <td className="px-4 py-3">
                    {b.isQuoteVisit ? 'Quote visit' : service ? SERVICE_LABELS[service.key] : '—'}
                  </td>
                  <td className="px-4 py-3 text-ink/70">{b.slotStart.replace('T', ' ')}</td>
                  <td className="px-4 py-3 text-ink/70">{b.cadence.replace('_', ' ').toLowerCase()}</td>
                  <td className="px-4 py-3 text-ink/70">{formatMoney(b.priceCents)}</td>
                  <td className="px-4 py-3">
                    <span className={`pill ${STATUS_STYLE[b.status]}`}>{b.status}</span>
                  </td>
                </tr>
              );
            })}
            {bookings.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-ink/40">
                  No bookings yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
