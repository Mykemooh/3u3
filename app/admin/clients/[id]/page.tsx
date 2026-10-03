import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/db/client';
import { clientRates, bookings as bookingsTable } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getTenant, getUserById, getServiceTypes, getAddressesFor, formatMoney, SERVICE_LABELS } from '@/lib/data';
import { getEstimatesForClient } from '@/lib/estimates';
import ClientRateForm from '@/components/ClientRateForm';
import StartEstimateButton from '@/components/StartEstimateButton';
import ClientInfoForm from '@/components/ClientInfoForm';
import CloseClientButton from '@/components/CloseClientButton';
import AddressForm from '@/components/AddressForm';
import BookingCadencePriceEditor from '@/components/BookingCadencePriceEditor';
import HomeProfileEditor from '@/components/HomeProfileEditor';
import { getHomeProfile } from '@/lib/homeProfile';
import { encryptionConfigured } from '@/lib/encryption';

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

export default async function ClientDetailPage({ params }: { params: { id: string } }) {
  const tenant = await getTenant();
  if (!tenant) return null;
  const client = await getUserById(params.id);
  if (!client || client.role !== 'CUSTOMER') notFound();

  const clientAddresses = await getAddressesFor(client.id);
  const primaryAddress = clientAddresses.find((a) => a.isPrimary) ?? clientAddresses[0];
  const otherAddresses = clientAddresses.filter((a) => a.id !== primaryAddress?.id);
  const rates = await db.select().from(clientRates).where(eq(clientRates.userId, client.id));
  const services = await getServiceTypes(tenant.id);
  const serviceMap = Object.fromEntries(services.map((s) => [s.id, s]));
  const clientBookings = (await db.select().from(bookingsTable).where(eq(bookingsTable.clientId, client.id))).sort(
    (a, b) => b.slotStart.localeCompare(a.slotStart),
  );
  const estimates = await getEstimatesForClient(client.id);
  const homeProfile = primaryAddress ? await getHomeProfile(primaryAddress.id) : null;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/admin/clients" className="text-sm text-muted hover:text-ink">← All clients</Link>
          <div className="mt-2 flex items-center gap-2">
            <h1 className="text-2xl font-bold text-ink">{client.name}</h1>
            {!client.isActive && <span className="pill bg-red-100 text-red-700">Closed</span>}
          </div>
          <p className="text-slate">
            {client.phone} {client.email ? `· ${client.email}` : ''}
          </p>
        </div>
        <CloseClientButton clientId={client.id} isActive={client.isActive} />
      </div>

      <div className="card max-w-xl">
        <h2 className="mb-4 font-semibold text-ink">Client info</h2>
        <ClientInfoForm clientId={client.id} initial={{ name: client.name, phone: client.phone, email: client.email }} />
      </div>

      <div className="card max-w-xl">
        <h2 className="mb-3 font-semibold text-ink">Address</h2>
        <AddressForm
          endpoint={`/api/admin/clients/${client.id}/address`}
          initial={{
            line1: primaryAddress?.line1 ?? '',
            city: primaryAddress?.city ?? '',
            state: primaryAddress?.state ?? '',
            zip: primaryAddress?.zip,
            notes: primaryAddress?.notes,
            bedrooms: primaryAddress?.bedrooms,
          }}
        />
        {otherAddresses.length > 0 && (
          <ul className="mt-3 space-y-1 border-t border-line pt-3">
            {otherAddresses.map((a) => (
              <li key={a.id} className="text-sm text-muted">{a.line1}, {a.city}, {a.state} {a.zip ?? ''}</li>
            ))}
          </ul>
        )}
      </div>

      {primaryAddress && (
        <div className="card max-w-2xl">
          <h2 className="mb-1 font-semibold text-ink">Home profile</h2>
          <p className="mb-4 text-sm text-slate">
            Pets, parking, allergies, do-not-touch items, an entry code, or room-specific notes — shown to the
            crew automatically on every visit. Fill this in during the quote walkthrough, or anytime after.
          </p>
          <HomeProfileEditor
            endpoint={`/api/admin/clients/${client.id}/home-profile`}
            entryCodeConfigured={encryptionConfigured()}
            initial={{
              pets: homeProfile?.pets ?? null,
              parkingNotes: homeProfile?.parkingNotes ?? null,
              allergyNotes: homeProfile?.allergyNotes ?? null,
              doNotTouch: homeProfile?.doNotTouch ?? null,
              entryCode: homeProfile?.entryCode ?? null,
              entryCodeSet: homeProfile?.entryCodeSet ?? false,
              roomNotes: homeProfile?.roomNotes ?? [],
            }}
          />
        </div>
      )}

      <div className="card max-w-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-ink">Estimates</h2>
          <StartEstimateButton
            clientId={client.id}
            serviceTypeId={services[0]?.id}
            label="+ New estimate"
          />
        </div>
        <div className="space-y-2">
          {estimates.map((q) => (
            <Link
              key={q.id}
              href={`/admin/estimates/${q.id}`}
              className="flex items-center justify-between border-b border-line py-2 text-sm last:border-0 hover:text-bronze"
            >
              <span className="flex items-center gap-2">
                <span className="font-medium">
                  {serviceMap[q.serviceTypeId] ? SERVICE_LABELS[serviceMap[q.serviceTypeId].key] : '—'}
                </span>
                <span className={`pill ${ESTIMATE_STYLE[q.status]}`}>{q.status}</span>
              </span>
              <span className="font-semibold text-bronze">{formatMoney(q.totalCents)}</span>
            </Link>
          ))}
          {estimates.length === 0 && (
            <p className="text-sm text-muted">No estimates yet for this client.</p>
          )}
        </div>
      </div>

      <div className="card max-w-2xl">
        <h2 className="mb-4 font-semibold text-ink">Agreed rates</h2>
        <div className="mb-4 space-y-2">
          {rates.map((r) => (
            <div key={r.id} className="flex items-center justify-between border-b border-line py-2 text-sm last:border-0">
              <span className="font-medium">{serviceMap[r.serviceTypeId] ? SERVICE_LABELS[serviceMap[r.serviceTypeId].key] : '—'}</span>
              <span className="font-semibold text-bronze">{formatMoney(r.rateCents)}</span>
            </div>
          ))}
          {rates.length === 0 && <p className="text-sm text-muted">No rates on file yet — set one below.</p>}
        </div>
        <ClientRateForm clientId={client.id} services={services.map((s) => ({ id: s.id, name: s.name }))} />
      </div>

      <div className="card overflow-x-auto p-0">
        <h2 className="px-4 pt-4 font-semibold text-ink">Booking history</h2>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-muted">
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">When</th>
              <th className="px-4 py-3 font-medium">Cadence</th>
              <th className="px-4 py-3 font-medium">Price</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {clientBookings.map((b) => {
              const service = b.serviceTypeId ? serviceMap[b.serviceTypeId] : null;
              return (
                <tr key={b.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3">{b.isQuoteVisit ? 'Quote visit' : service ? SERVICE_LABELS[service.key] : '—'}</td>
                  <td className="px-4 py-3 text-slate">{b.slotStart.replace('T', ' ')}</td>
                  <td className="px-4 py-3 text-slate">{b.cadence.replace('_', ' ').toLowerCase()}</td>
                  <td className="px-4 py-3 text-slate">{formatMoney(b.priceCents)}</td>
                  <td className="px-4 py-3"><span className={`pill ${STATUS_STYLE[b.status]}`}>{b.status}</span></td>
                  <td className="px-4 py-3">
                    {!b.isQuoteVisit && (
                      <BookingCadencePriceEditor
                        bookingId={b.id}
                        cadence={b.cadence}
                        priceDollars={b.priceCents != null ? b.priceCents / 100 : null}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
            {clientBookings.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted">No bookings yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
