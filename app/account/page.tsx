import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { getAccountBookings, cleaningJourney, type AccountBooking } from '@/lib/account';
import { getClientRatesFor, formatMoney } from '@/lib/data';
import { serviceName as serviceLabel } from '@/lib/format';
import { formatDateLabel, formatSlotLabel } from '@/lib/scheduling';
import { businessNowISO } from '@/lib/time';
import { invoiceLabel } from '@/lib/invoices';
import JourneyRail from '@/components/app/JourneyRail';
import LiveTrackingMap from '@/components/app/LiveTrackingMap';
import AddToCalendar from '@/components/AddToCalendar';
import { getTracking, publicMapboxToken, type TrackingState } from '@/lib/tracking';
import ClientDashboard from '@/components/account/ClientDashboard';
import { getEstimatesForClient } from '@/lib/estimates';
import { db } from '@/db/client';
import { reviews } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getTenant } from '@/lib/data';
import { automationState } from '@/lib/automations';
import { ensureReferralCode, referralLink } from '@/lib/referrals';
import { users } from '@/db/schema';
import { getLocale } from '@/lib/i18n/server';
import { translator, type Locale, type Translate } from '@/lib/i18n';
import { accountMessages } from '@/lib/i18n/messages/account';

type T = Translate<typeof accountMessages.en>;

export const dynamic = 'force-dynamic';

function serviceName(row: AccountBooking, locale: Locale, t: T) {
  return row.service ? serviceLabel(row.service.key, row.service.name, locale) : t('serviceFallback');
}

export default async function AccountHome() {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id: string; name?: string; role?: string };
  if (user.role === 'ADMIN') redirect('/admin');

  const locale = await getLocale();
  const t = translator(accountMessages, locale);
  const tenant = await getTenant();
  const [rows, rates, quoteRows, reviewRows, referralOn, me] = await Promise.all([
    getAccountBookings(user.id),
    getClientRatesFor(user.id),
    getEstimatesForClient(user.id),
    db.select({ bookingId: reviews.bookingId }).from(reviews).where(eq(reviews.clientId, user.id)),
    tenant ? automationState(tenant.id, 'referral_rewards').then((s) => s.enabled && tenant.referralCreditCents > 0) : false,
    db.select({ creditCents: users.creditCents }).from(users).where(eq(users.id, user.id)).then((r) => r[0]),
  ]);
  // Only clients who have had a clean get a referral link to share.
  const hasCleaned = rows.some((r) => r.job?.status === 'COMPLETE');
  const code = referralOn && hasCleaned ? await ensureReferralCode(user.id) : null;
  const now = businessNowISO();

  // The "live" cleaning: one the crew is driving to or working on, else the
  // next one booked, else the most recent that still has something to act
  // on (photos, invoice).
  const active = rows.find((r) => r.job?.status === 'EN_ROUTE' || r.job?.status === 'IN_PROGRESS');
  const upcoming = rows.filter((r) => r.booking.slotEnd >= now && r.job?.status !== 'COMPLETE');
  const past = rows.filter((r) => r.job?.status === 'COMPLETE').reverse();
  const needsPayment = rows.filter((r) => r.invoice?.status === 'SENT');
  const focus = active ?? upcoming[0] ?? past[0];
  const first = user.name ? user.name.split(' ')[0] : null;
  const tracking = focus?.job?.status === 'EN_ROUTE' ? getTracking(focus.job) : null;
  const nextRow = active ?? upcoming[0];
  const lastRow = past[0];
  const reviewed = new Set(reviewRows.map((r) => r.bookingId));
  const dashboard = {
    next: nextRow
      ? {
          bookingId: nextRow.booking.id,
          slotStart: nextRow.booking.slotStart,
          slotEnd: nextRow.booking.slotEnd,
          serviceName: serviceName(nextRow, locale, t),
          note: nextRow.booking.clientNotes ?? null,
          onTheWay: nextRow.job?.status === 'EN_ROUTE',
        }
      : null,
    openQuotes: quoteRows
      .filter((q) => q.status === 'SENT')
      .map((q) => ({ id: q.id, href: q.approvalToken ? `/estimate/${q.approvalToken}` : null, totalCents: q.totalCents, status: q.status })),
    lastClean: lastRow?.job
      ? { jobId: lastRow.job.id, date: lastRow.booking.slotStart.slice(0, 10), photoCount: lastRow.photoCount, reviewed: reviewed.has(lastRow.booking.id) }
      : null,
    balanceCents: needsPayment.reduce((sum, r) => sum + (r.invoice?.totalCents ?? 0), 0),
    unpaidHref: needsPayment[0] ? `/account/invoices/${needsPayment[0].invoice!.id}` : null,
    canBook: rates.length > 0,
    referral: code && tenant ? { link: referralLink(code), rewardCents: tenant.referralCreditCents, creditCents: me?.creditCents ?? 0 } : null,
  };

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow">{t('homeEyebrow')}</p>
          <h1 className="mt-1 text-3xl font-extrabold">{first ? t('homeHi', { name: first }) : t('homeHiNoName')}</h1>
        </div>
        <Link href="/account/settings" className="mt-1 text-sm font-semibold text-bronze hover:underline">
          {t('homeSettingsLink')}
        </Link>
      </div>

      <ClientDashboard {...dashboard} />


      {focus ? (
        <FocusCard
          row={focus}
          isPast={focus.job?.status === 'COMPLETE' && focus === past[0] && !active && upcoming.length === 0}
          tracking={tracking}
          locale={locale}
          t={t}
        />
      ) : (
        <div className="card text-center">
          <h2 className="text-xl font-bold">{t('homeEmptyTitle')}</h2>
          <p className="mx-auto mt-2 max-w-sm text-slate">
            {rates.length ? t('homeEmptyCanBook') : t('homeEmptyNeedsEstimate')}
          </p>
          {rates.length > 0 && (
            <Link href="/book" className="btn-primary mt-5">
              {t('bookACleaning')}
            </Link>
          )}
        </div>
      )}

      {upcoming.filter((r) => r !== focus).length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">{t('homeAlsoBooked')}</h2>
          <div className="space-y-3">
            {upcoming
              .filter((r) => r !== focus)
              .map((r) => (
                <div key={r.booking.id} className="card flex items-center justify-between gap-3 p-5">
                  <div>
                    <p className="font-semibold">{formatDateLabel(r.booking.slotStart.slice(0, 10), locale)}</p>
                    <p className="text-sm text-slate">
                      {formatSlotLabel(r.booking.slotStart, r.booking.slotEnd)} · {serviceName(r, locale, t)}
                    </p>
                  </div>
                  <AddToCalendar
                    bookingId={r.booking.id}
                    event={{
                      uid: `booking-${r.booking.id}@3u3cleaning`,
                      title: t('calendarTitle', { service: serviceName(r, locale, t) }),
                      description: t('calendarDescription', { service: serviceName(r, locale, t).toLowerCase() }),
                      location: r.address ? `${r.address.line1}, ${r.address.city}` : undefined,
                      slotStart: r.booking.slotStart,
                      slotEnd: r.booking.slotEnd,
                    }}
                  />
                </div>
              ))}
          </div>
        </section>
      )}

      {past.filter((r) => r !== focus).length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">{t('homePastCleanings')}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {past
              .filter((r) => r !== focus)
              .map((r) => (
                <Link key={r.booking.id} href={`/account/jobs/${r.job!.id}`} className="card-interactive flex items-center gap-4 p-4">
                  <Thumb url={r.cover} noPhoto={t('homeNoPhoto')} />
                  <div className="min-w-0">
                    <p className="font-semibold">{formatDateLabel(r.booking.slotStart.slice(0, 10), locale)}</p>
                    <p className="text-sm text-slate">{serviceName(r, locale, t)}</p>
                    <p className="text-xs font-semibold text-bronze">{t('seeBeforeAfter')}</p>
                  </div>
                </Link>
              ))}
          </div>
        </section>
      )}

      {rates.length > 0 && focus && (
        <Link href="/book" className="btn-dark w-full">
          {t('homeBookAnother')}
        </Link>
      )}
    </div>
  );
}

function Thumb({ url, noPhoto }: { url: string | null; noPhoto: string }) {
  return url ? (
    <img src={url} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" loading="lazy" />
  ) : (
    <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-surface text-xs text-muted">{noPhoto}</span>
  );
}

function FocusCard({ row, isPast, tracking, locale, t }: { row: AccountBooking; isPast: boolean; tracking: TrackingState | null; locale: Locale; t: T }) {
  const { booking, job, invoice } = row;
  const status = job?.status;
  const heading =
    status === 'EN_ROUTE'
      ? t('crewOnTheWay')
      : status === 'IN_PROGRESS'
      ? t('focusCleaningNow')
      : status === 'COMPLETE'
      ? isPast
        ? t('focusLast')
        : t('focusAllDone')
      : t('focusNext');

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
      <div className="p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="eyebrow">{heading}</p>
            <p className="mt-2 text-2xl font-bold">{formatDateLabel(booking.slotStart.slice(0, 10), locale)}</p>
          </div>
          {!status || status === 'PENDING' ? (
            <AddToCalendar
              bookingId={booking.id}
              event={{
                uid: `booking-${booking.id}@3u3cleaning`,
                title: t('calendarTitle', { service: serviceName(row, locale, t) }),
                description: t('calendarDescription', { service: serviceName(row, locale, t).toLowerCase() }),
                location: row.address ? `${row.address.line1}, ${row.address.city}` : undefined,
                slotStart: booking.slotStart,
                slotEnd: booking.slotEnd,
              }}
            />
          ) : null}
        </div>
        <p className="mt-1 text-slate">
          {formatSlotLabel(booking.slotStart, booking.slotEnd)} · {serviceName(row, locale, t)}
          {booking.priceCents != null ? ` · ${formatMoney(booking.priceCents)}` : ''}
        </p>
        {row.address && <p className="text-slate">{row.address.line1}, {row.address.city}</p>}
        <div className="mt-6">
          <JourneyRail steps={cleaningJourney(row, locale)} />
        </div>
        {job && tracking?.status === 'EN_ROUTE' && (
          <div className="mt-6">
            <LiveTrackingMap jobId={job.id} token={publicMapboxToken()} initial={tracking} />
          </div>
        )}
      </div>
      {status === 'COMPLETE' && job && (
        <Link href={`/account/jobs/${job.id}`} className="flex items-center gap-4 border-t border-line bg-surface p-4 transition hover:bg-cream/60">
          <Thumb url={row.cover} noPhoto={t('homeNoPhoto')} />
          <div>
            <p className="font-semibold">{t('focusSeeBeforeAfter')}</p>
            <p className="text-sm text-slate">
              {t(row.photoCount === 1 ? 'focusPhotosOne' : 'focusPhotosMany', { count: row.photoCount })}
              {row.videoCount ? ` · ${t(row.videoCount === 1 ? 'focusVideosOne' : 'focusVideosMany', { count: row.videoCount })}` : ''}
            </p>
          </div>
        </Link>
      )}
      {invoice && (
        <Link href={`/account/invoices/${invoice.id}`} className="flex items-center justify-between border-t border-line px-6 py-4 text-sm font-semibold transition hover:bg-cream/60">
          <span>
            {invoiceLabel(invoice)} · {formatMoney(invoice.totalCents)}
          </span>
          <span className={invoice.status === 'PAID' ? 'text-green' : 'text-bronze'}>{invoice.status === 'PAID' ? t('pillPaid') : t('focusViewAndPay')}</span>
        </Link>
      )}
      {status === 'IN_PROGRESS' && (
        <p className="border-t border-line bg-cream/60 px-6 py-3 text-sm text-bronze">
          {t('focusPhotosSoon')}
        </p>
      )}
    </section>
  );
}
