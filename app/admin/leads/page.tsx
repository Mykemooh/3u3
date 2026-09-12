import Link from 'next/link';
import { db } from '@/db/client';
import { users, addresses, clientRates } from '@/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { getTenant, getAllBookings } from '@/lib/data';
import BookingStatusActions from '@/components/BookingStatusActions';

const STATUS_STYLE: Record<string, string> = {
  REQUESTED: 'bg-amber-100 text-amber-700',
  CONFIRMED: 'bg-emerald-100 text-emerald-700',
  COMPLETED: 'bg-blue-100 text-blue-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

// New-lead pipeline (PRD 6.2): every quote-visit request, separate from
// confirmed cleaning jobs. "Won" isn't a booking status of its own — it's
// inferred from whether the client already has an agreed rate on file,
// since that's the real signal a quote turned into paying business.
export default async function AdminLeads() {
  const tenant = await getTenant();
  if (!tenant) return null;
  const allBookings = await getAllBookings(tenant.id);
  const leads = allBookings
    .filter((b) => b.isQuoteVisit)
    .sort((a, b) => b.slotStart.localeCompare(a.slotStart));

  const clientIds = [...new Set(leads.map((l) => l.clientId))];
  const clients = clientIds.length
    ? await db.select().from(users).where(inArray(users.id, clientIds))
    : [];
  const clientMap = Object.fromEntries(clients.map((c) => [c.id, c]));

  const addressIds = leads.map((l) => l.addressId).filter(Boolean) as string[];
  const addressRows = addressIds.length
    ? await db.select().from(addresses).where(inArray(addresses.id, addressIds))
    : [];
  const addressMap = Object.fromEntries(addressRows.map((a) => [a.id, a]));

  const ratesByClient = clientIds.length
    ? await db.select().from(clientRates).where(inArray(clientRates.userId, clientIds))
    : [];
  const wonClientIds = new Set(ratesByClient.map((r) => r.userId));

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-ink">Leads</h1>
      <p className="mb-6 text-ink/60">Every quote-visit request, from first capture to won or lost.</p>

      <div className="grid grid-cols-1 gap-3">
        {leads.map((lead) => {
          const client = clientMap[lead.clientId];
          const address = lead.addressId ? addressMap[lead.addressId] : null;
          const won = client ? wonClientIds.has(client.id) : false;
          return (
            <div key={lead.id} className="card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-ink">{client?.name ?? 'Unknown'}</p>
                  <span className={`pill ${STATUS_STYLE[lead.status]}`}>{lead.status}</span>
                  {won && <span className="pill bg-gold/15 text-bronze">Won — rate on file</span>}
                </div>
                <p className="text-sm text-ink/60">
                  {client?.phone} {client?.email ? `· ${client.email}` : ''}
                </p>
                {address && <p className="text-sm text-ink/60">{address.line1}, {address.city}, {address.state}</p>}
                <p className="text-sm text-ink/50">Visit: {lead.slotStart.replace('T', ' ')}</p>
              </div>
              <div className="flex items-center gap-3">
                {client && (
                  <Link href={`/admin/clients/${client.id}`} className="text-sm font-semibold text-bronze hover:underline">
                    {won ? 'View client' : 'Convert to client →'}
                  </Link>
                )}
                <BookingStatusActions bookingId={lead.id} status={lead.status} completeLabel="Mark visited" />
              </div>
            </div>
          );
        })}
        {leads.length === 0 && (
          <div className="card text-center text-ink/40">No leads yet — new quote requests will show up here.</div>
        )}
      </div>
    </div>
  );
}
