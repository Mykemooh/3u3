import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import {
  getTenant, getServiceTypes, getClientRatesFor, getAddressesFor, getUpcomingBookingsForClient,
  formatMoney, SERVICE_LABELS,
} from '@/lib/data';
import { canModifyBooking } from '@/lib/bookings';
import AddressForm from '@/components/AddressForm';
import MyBookingCard from '@/components/MyBookingCard';

export const dynamic = 'force-dynamic';

export default async function AccountSettings() {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id: string; role?: string };
  if (user.role === 'ADMIN') redirect('/admin');

  const tenant = await getTenant();
  if (!tenant) redirect('/account');

  const [services, rates, addresses, upcoming] = await Promise.all([
    getServiceTypes(tenant.id),
    getClientRatesFor(user.id),
    getAddressesFor(user.id),
    getUpcomingBookingsForClient(user.id),
  ]);

  const primaryAddress = addresses.find((a) => a.isPrimary) ?? addresses[0];

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">My account</p>
        <h1 className="mt-1 text-3xl font-extrabold">Settings</h1>
        <p className="mt-2 text-slate">
          Update your address, or change the frequency, time, or status of an upcoming cleaning — all up to
          24 hours before it begins.
        </p>
      </div>

      <div className="card">
        <h2 className="mb-1 font-semibold text-ink">My address</h2>
        <p className="mb-4 text-sm text-slate">Changed addresses? Update it here and we'll let the team know.</p>
        <AddressForm
          endpoint="/api/account/address"
          initial={{
            line1: primaryAddress?.line1 ?? '',
            city: primaryAddress?.city ?? '',
            state: primaryAddress?.state ?? '',
            zip: primaryAddress?.zip,
            notes: primaryAddress?.notes,
          }}
        />
      </div>

      <div className="card">
        <h2 className="mb-1 font-semibold text-ink">Upcoming cleanings</h2>
        <p className="mb-4 text-sm text-slate">
          Change your frequency, reschedule, or cancel up to 24 hours before a cleaning begins. Closer than
          that, please call us directly.
        </p>
        <div className="space-y-4">
          {upcoming.map((b) => {
            const service = services.find((s) => s.id === b.serviceTypeId);
            const rate = rates.find((r) => r.serviceTypeId === b.serviceTypeId);
            return (
              <MyBookingCard
                key={b.id}
                booking={{
                  id: b.id,
                  serviceTypeId: b.serviceTypeId,
                  serviceName: service ? SERVICE_LABELS[service.key] ?? service.name : 'Cleaning',
                  slotStart: b.slotStart,
                  slotEnd: b.slotEnd,
                  cadence: b.cadence,
                  recurringEligible: service?.recurringEligible ?? false,
                  canModify: canModifyBooking(b.slotStart),
                  priceLabel: formatMoney(b.priceCents ?? rate?.rateCents),
                }}
              />
            );
          })}
          {upcoming.length === 0 && <p className="text-sm text-muted">Nothing scheduled right now.</p>}
        </div>
      </div>
    </div>
  );
}
