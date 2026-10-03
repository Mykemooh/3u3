import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getBookingById, getUserById, getAddressesFor } from '@/lib/data';
import { getHomeProfile } from '@/lib/homeProfile';
import { encryptionConfigured } from '@/lib/encryption';
import HomeProfileEditor from '@/components/HomeProfileEditor';
import RoomCountForm from '@/components/admin/RoomCountForm';

export const dynamic = 'force-dynamic';

/**
 * What the admin fills in while actually standing in the home for the
 * quote visit: how many bedrooms/bathrooms (drives the per-room
 * checklist, lib/bookings.ts createBooking), and the full home profile —
 * pets, parking, allergies, do-not-touch items, an entry code, room
 * notes. Everything here writes straight to the client's address, the
 * same place My Account's own "Home profile" section reads from — fill
 * it in here, or let the client fill in the rest themselves later.
 */
export default async function QuoteWalkthrough({ params }: { params: { id: string } }) {
  const lead = await getBookingById(params.id);
  if (!lead || !lead.isQuoteVisit) notFound();

  const [client, addresses] = await Promise.all([getUserById(lead.clientId), getAddressesFor(lead.clientId)]);
  if (!client) notFound();
  const address = addresses.find((a) => a.id === lead.addressId) ?? addresses.find((a) => a.isPrimary) ?? addresses[0];
  const homeProfile = address ? await getHomeProfile(address.id) : null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href="/admin/leads" className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink">
        <span aria-hidden="true">←</span> All leads
      </Link>

      <div>
        <p className="eyebrow">Quote walkthrough</p>
        <h1 className="mt-1 text-2xl font-bold text-ink">{client.name}</h1>
        {address && <p className="text-slate">{address.line1}, {address.city}, {address.state} {address.zip ?? ''}</p>}
        <p className="text-sm text-muted">Visit: {lead.slotStart.replace('T', ' ')}</p>
      </div>

      {!address ? (
        <p className="card text-sm text-amber-700">
          This client has no address on file yet — add one on their{' '}
          <Link href={`/admin/clients/${client.id}`} className="font-semibold underline">
            client page
          </Link>{' '}
          before walking the home.
        </p>
      ) : (
        <>
          <div className="card">
            <h2 className="mb-1 font-semibold text-ink">Room counts</h2>
            <p className="mb-4 text-sm text-slate">
              Drives how the cleaning checklist is built — "Bedroom 1", "Bedroom 2", etc. instead of one generic
              entry.
            </p>
            <RoomCountForm addressId={address.id} initial={{ bedrooms: address.bedrooms, bathrooms: address.bathrooms }} />
          </div>

          <div className="card">
            <h2 className="mb-1 font-semibold text-ink">Home profile</h2>
            <p className="mb-4 text-sm text-slate">
              Pets, parking, allergies, do-not-touch items, an entry code, or room-specific notes — shown to the
              crew automatically on every visit from now on.
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

          <Link href={`/admin/clients/${client.id}`} className="btn-primary inline-block">
            Done — go build their estimate
          </Link>
        </>
      )}
    </div>
  );
}
