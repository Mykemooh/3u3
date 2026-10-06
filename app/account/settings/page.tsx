import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import {
  getTenant, getServiceTypes, getClientRatesFor, getAddressesFor, getUpcomingBookingsForClient,
  getUserById, formatMoney, SERVICE_LABELS,
} from '@/lib/data';
import { canModifyBooking } from '@/lib/bookings';
import { publicStripeKey } from '@/lib/payments';
import { getAccountBookings, pendingInvoicesFor, paymentHistoryByMonth } from '@/lib/account';
import AddressForm from '@/components/AddressForm';
import MyBookingCard from '@/components/MyBookingCard';
import AvatarUpload from '@/components/AvatarUpload';
import PaymentMethodCard from '@/components/PaymentMethodCard';
import NotificationPreferences from '@/components/NotificationPreferences';
import PendingInvoices from '@/components/account/PendingInvoices';
import PaymentHistoryByMonth from '@/components/account/PaymentHistoryByMonth';
import HomeProfileEditor from '@/components/HomeProfileEditor';
import PhonePinCard from '@/components/PhonePinCard';
import { hasPin } from '@/lib/phonePin';
import { getHomeProfile } from '@/lib/homeProfile';
import { encryptionConfigured } from '@/lib/encryption';

export const dynamic = 'force-dynamic';

export default async function AccountSettings() {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id: string; role?: string };
  if (user.role === 'ADMIN') redirect('/admin');

  const tenant = await getTenant();
  if (!tenant) redirect('/account');

  const [me, services, rates, addresses, upcoming, accountBookings] = await Promise.all([
    getUserById(user.id),
    getServiceTypes(tenant.id),
    getClientRatesFor(user.id),
    getAddressesFor(user.id),
    getUpcomingBookingsForClient(user.id),
    getAccountBookings(user.id),
  ]);
  if (!me) redirect('/account');

  const primaryAddress = addresses.find((a) => a.isPrimary) ?? addresses[0];
  const pending = pendingInvoicesFor(accountBookings);
  const paymentMonths = paymentHistoryByMonth(accountBookings);
  const pinSet = await hasPin(user.id);
  const homeProfile = primaryAddress ? await getHomeProfile(primaryAddress.id) : null;

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">My account</p>
        <h1 className="mt-1 text-3xl font-extrabold">Settings</h1>
        <p className="mt-2 text-slate">
          Update your profile, payment, or notification preferences, or change an upcoming cleaning — all up
          to 24 hours before it begins.
        </p>
      </div>

      <section className="card">
        <h2 className="mb-4 text-lg font-bold text-ink">My account</h2>
        <div className="grid gap-6 sm:grid-cols-3">
          <div>
            <h3 className="mb-2 text-sm font-semibold text-ink">Profile picture</h3>
            <AvatarUpload name={me.name} initialUrl={me.avatarUrl} />
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-ink">My address</h3>
            <p className="mb-3 text-xs text-slate">Changed addresses? Update it here and we'll let the team know.</p>
            <AddressForm
              endpoint="/api/account/address"
              initial={{
                line1: primaryAddress?.line1 ?? '',
                city: primaryAddress?.city ?? '',
                state: primaryAddress?.state ?? '',
                zip: primaryAddress?.zip,
                notes: primaryAddress?.notes,
                bedrooms: primaryAddress?.bedrooms,
              }}
            />
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-ink">Notifications</h3>
            <p className="mb-3 text-xs text-slate">Where we send booking reminders and other updates.</p>
            <NotificationPreferences initial={me.notificationChannel} hasPhone={!!me.phone} bare />
          </div>
        </div>
      </section>

      <PhonePinCard initiallySet={pinSet} />

      {primaryAddress && (
        <section id="home" className="card scroll-mt-24">
          <h2 className="mb-1 text-lg font-bold text-ink">Home profile</h2>
          <p className="mb-4 text-sm text-slate">
            Pets, parking, allergies, anything the crew shouldn't touch, an entry code, or notes for a specific
            room — shown to the crew automatically on every visit.
          </p>
          <HomeProfileEditor
            endpoint="/api/account/home-profile"
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
        </section>
      )}

      <section id="payment" className="card scroll-mt-24 space-y-6">
        <h2 className="text-lg font-bold text-ink">Payment</h2>

        <div>
          <h3 className="mb-2 text-sm font-semibold text-ink">Payment method</h3>
          <PaymentMethodCard
            publishableKey={publicStripeKey()}
            saved={
              me.stripeDefaultPaymentMethodId
                ? {
                    brand: me.paymentMethodBrand,
                    last4: me.paymentMethodLast4,
                    expMonth: me.paymentMethodExpMonth,
                    expYear: me.paymentMethodExpYear,
                    autopayEnabled: me.autopayEnabled,
                  }
                : null
            }
            bare
          />
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold text-ink">Pending invoice{pending.length === 1 ? '' : 's'}</h3>
          <PendingInvoices invoices={pending} />
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold text-ink">Payment history</h3>
          <PaymentHistoryByMonth months={paymentMonths} />
        </div>
      </section>

      <section id="bookings" className="card scroll-mt-24">
        <h2 className="mb-1 text-lg font-bold text-ink">Upcoming cleanings</h2>
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
      </section>
    </div>
  );
}
