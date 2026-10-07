import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import {
  getTenant, getServiceTypes, getClientRatesFor, getAddressesFor, getUpcomingBookingsForClient,
  getUserById, formatMoney,
} from '@/lib/data';
import { serviceName } from '@/lib/format';
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
import LanguageSetting from '@/components/account/LanguageSetting';
import { getLocale } from '@/lib/i18n/server';
import { translator } from '@/lib/i18n';
import { accountMessages } from '@/lib/i18n/messages/account';

export const dynamic = 'force-dynamic';

export default async function AccountSettings() {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id: string; role?: string };
  if (user.role === 'ADMIN') redirect('/admin');

  const locale = await getLocale();
  const t = translator(accountMessages, locale);
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
  const pending = pendingInvoicesFor(accountBookings, locale);
  const paymentMonths = paymentHistoryByMonth(accountBookings, locale);
  const pinSet = await hasPin(user.id);
  const homeProfile = primaryAddress ? await getHomeProfile(primaryAddress.id) : null;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="ct-title">{t('setTitle')}</h1>
        <p className="ct-lead mt-1 max-w-[60ch]">{t('setIntro')}</p>
      </header>

      <section className="overflow-hidden rounded-2xl border border-line bg-white">
        <h2 className="ct-h2 px-5 pt-5 sm:px-6">{t('setMyAccount')}</h2>
        <div className="divide-y divide-line">
          <Row title={t('setProfilePicture')}>
            <AvatarUpload name={me.name} initialUrl={me.avatarUrl} />
          </Row>
          <Row title={t('setMyAddress')} help={t('setAddressHelp')}>
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
          </Row>
          <Row title={t('setNotifications')} help={t('setNotificationsHelp')}>
            <NotificationPreferences initial={me.notificationChannel} hasPhone={!!me.phone} bare />
          </Row>
          <Row title={t('setLanguage')} help={t('setLanguageHelp')}>
            <LanguageSetting />
          </Row>
        </div>
      </section>

      <PhonePinCard initiallySet={pinSet} />

      {primaryAddress && (
        <section id="home" className="card scroll-mt-24">
          <h2 className="ct-h2">{t('setHomeProfile')}</h2>
          <p className="mb-5 mt-1 max-w-[60ch] text-[15px] text-slate">{t('setHomeProfileHelp')}</p>
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

      <section id="payment" className="scroll-mt-24 overflow-hidden rounded-2xl border border-line bg-white">
        <h2 className="ct-h2 px-5 pt-5 sm:px-6">{t('setPayment')}</h2>
        <div className="divide-y divide-line">
        <Row title={t('setPaymentMethod')}>
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
        </Row>
        <Row title={t(pending.length === 1 ? 'setPendingOne' : 'setPendingMany')}>
          <PendingInvoices invoices={pending} />
        </Row>
        <Row title={t('setPaymentHistory')}>
          <PaymentHistoryByMonth months={paymentMonths} />
        </Row>
        </div>
      </section>

      <section id="bookings" className="card scroll-mt-24">
        <h2 className="ct-h2">{t('setUpcoming')}</h2>
        <p className="mb-5 mt-1 max-w-[60ch] text-[15px] text-slate">{t('setUpcomingHelp')}</p>
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
                  serviceName: service ? serviceName(service.key, service.name, locale) : t('serviceFallback'),
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
          {upcoming.length === 0 && <p className="text-[15px] text-muted">{t('setNothingScheduled')}</p>}
        </div>
      </section>
    </div>
  );
}

/**
 * One setting: what it is (and a line on why) beside the control on wide
 * screens, above it on a phone.
 */
function Row({ title, help, children }: { title: string; help?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-3 px-5 py-5 sm:px-6 md:grid-cols-[minmax(0,14rem)_1fr] md:gap-8">
      <div>
        <h3 className="text-base font-semibold text-ink">{title}</h3>
        {help && <p className="ct-meta mt-1">{help}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
