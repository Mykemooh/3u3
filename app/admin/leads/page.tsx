import Link from 'next/link';
import { db } from '@/db/client';
import { users, addresses, clientRates, serviceTypes, quotes } from '@/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { getTenant, getAllBookings } from '@/lib/data';
import BookingStatusActions from '@/components/BookingStatusActions';
import StartEstimateButton from '@/components/StartEstimateButton';

const ESTIMATE_STYLE: Record<string, string> = {
  DRAFT: 'bg-surface text-slate',
  SENT: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-emerald-100 text-emerald-700',
  DECLINED: 'bg-red-100 text-red-700',
  EXPIRED: 'bg-line text-muted',
};

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

  const serviceIds = [...new Set(leads.map((l) => l.serviceTypeId).filter(Boolean))] as string[];
  const serviceRows = serviceIds.length
    ? await db.select().from(serviceTypes).where(inArray(serviceTypes.id, serviceIds))
    : [];
  const serviceMap = Object.fromEntries(serviceRows.map((s) => [s.id, s.name]));

  // Where each lead stands on its estimate — so the next action on a lead
  // ("build one" / "chasing an answer" / "they said yes") is visible
  // without opening anything.
  const leadIds = leads.map((l) => l.id);
  const estimateRows = leadIds.length
    ? await db.select().from(quotes).where(inArray(quotes.quoteVisitBookingId, leadIds))
    : [];
  const estimateByVisit = Object.fromEntries(
    estimateRows.filter((q) => q.quoteVisitBookingId).map((q) => [q.quoteVisitBookingId as string, q]),
  );

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-ink">Leads</h1>
      <p className="mb-6 text-slate">Every quote-visit request, from first capture to won or lost.</p>

      <div className="grid grid-cols-1 gap-3">
        {leads.map((lead) => {
          const client = clientMap[lead.clientId];
          const address = lead.addressId ? addressMap[lead.addressId] : null;
          const won = client ? wonClientIds.has(client.id) : false;
          const estimate = estimateByVisit[lead.id];
          return (
            <div key={lead.id} className="card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-ink">{client?.name ?? 'Unknown'}</p>
                  <span className={`pill ${STATUS_STYLE[lead.status]}`}>{lead.status}</span>
                  {lead.serviceTypeId && serviceMap[lead.serviceTypeId] && (
                    <span className="pill bg-surface text-slate">{serviceMap[lead.serviceTypeId]}</span>
                  )}
                  {estimate && (
                    <span className={`pill ${ESTIMATE_STYLE[estimate.status]}`}>Estimate {estimate.status}</span>
                  )}
                  {won && <span className="pill bg-gold/15 text-bronze">Won — rate on file</span>}
                </div>
                <p className="text-sm text-slate">
                  {client?.phone} {client?.email ? `· ${client.email}` : ''}
                </p>
                {address && <p className="text-sm text-slate">{address.line1}, {address.city}, {address.state}</p>}
                <p className="text-sm text-muted">Visit: {lead.slotStart.replace('T', ' ')}</p>
              </div>
              <div className="flex items-center gap-3">
                {client && (
                  <Link href={`/admin/clients/${client.id}`} className="text-sm font-semibold text-bronze hover:underline">
                    View client
                  </Link>
                )}
                {client &&
                  (estimate ? (
                    <Link
                      href={`/admin/estimates/${estimate.id}`}
                      className="text-sm font-semibold text-bronze hover:underline"
                    >
                      Open estimate →
                    </Link>
                  ) : (
                    <StartEstimateButton
                      clientId={client.id}
                      serviceTypeId={lead.serviceTypeId ?? undefined}
                      quoteVisitBookingId={lead.id}
                    />
                  ))}
                <BookingStatusActions bookingId={lead.id} status={lead.status} completeLabel="Mark visited" />
              </div>
            </div>
          );
        })}
        {leads.length === 0 && (
          <div className="card text-center text-muted">No leads yet — new quote requests will show up here.</div>
        )}
      </div>
    </div>
  );
}
