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
import TeamNoteButton from '@/components/account/TeamNoteButton';
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
    // The cleaning card above already shows the last clean when it's the
    // focus, so the glance panel doesn't repeat it.
    lastInFocus: !!lastRow && focus === lastRow,
    nextInFocus: !focus || (!!nextRow && focus === nextRow),
    referral: code && tenant ? { link: referralLink(code), rewardCents: tenant.referralCreditCents, creditCents: me?.creditCents ?? 0 } : null,
  };

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="ct-title">{first ? t('homeHi', { name: first }) : t('homeHiNoName')}</h1>
          <p className="ct-lead mt-1">{t('homeEyebrow')}</p>
        </div>
        <Link href="/account/settings" className="ct-action mt-0.5 shrink-0">
          <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
          </svg>
          {t('homeSettingsLink')}
        </Link>
      </header>

      {focus ? (
        <FocusCard
          row={focus}
          isPast={focus.job?.status === 'COMPLETE' && focus === past[0] && !active && upcoming.length === 0}
          upcoming={focus === nextRow && focus.job?.status !== 'COMPLETE'}
          rateHref={focus.job?.status === 'COMPLETE' && !reviewed.has(focus.booking.id) ? `/account/jobs/${focus.job.id}#rate` : null}
          tracking={tracking}
          locale={locale}
          t={t}
        />
      ) : (
        <div className="rounded-2xl border border-line bg-white px-6 py-8 text-center shadow-card">
          <h2 className="ct-hero">{t('homeEmptyTitle')}</h2>
          <p className="ct-lead mx-auto mt-2 max-w-[34ch]">
            {rates.length ? t('homeEmptyCanBook') : t('homeEmptyNeedsEstimate')}
          </p>
          {rates.length > 0 && (
            <Link href="/book" className="btn-primary mt-5">
              {t('bookACleaning')}
            </Link>
          )}
        </div>
      )}

      <ClientDashboard {...dashboard} />

      {upcoming.filter((r) => r !== focus).length > 0 && (
        <section>
          <h2 className="ct-h2 mb-3 mt-4">{t('homeAlsoBooked')}</h2>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-white">
            {upcoming
              .filter((r) => r !== focus)
              .map((r) => (
                <li key={r.booking.id} className="flex items-center justify-between gap-3 px-5 py-4">
                  <div className="min-w-0">
                    <p className="ct-h3">{formatDateLabel(r.booking.slotStart.slice(0, 10), locale)}</p>
                    <p className="money mt-0.5 text-[15px] text-slate">{formatSlotLabel(r.booking.slotStart, r.booking.slotEnd, locale)}</p>
                    <p className="ct-meta">{serviceName(r, locale, t)}</p>
                  </div>
                  <AddToCalendar
                    compact
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
                </li>
              ))}
          </ul>
        </section>
      )}

      {past.filter((r) => r !== focus).length > 0 && (
        <section>
          <h2 className="ct-h2 mb-3 mt-4">{t('homePastCleanings')}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {past
              .filter((r) => r !== focus)
              .map((r) => (
                <Link key={r.booking.id} href={`/account/jobs/${r.job!.id}`} className="card-interactive flex items-center gap-4 p-4">
                  <Thumb url={r.cover} noPhoto={t('homeNoPhoto')} />
                  <div className="min-w-0">
                    <p className="ct-h3">{formatDateLabel(r.booking.slotStart.slice(0, 10), locale)}</p>
                    <p className="text-[15px] text-slate">{serviceName(r, locale, t)}</p>
                    <p className="mt-0.5 text-sm font-semibold text-bronze">{t('seeBeforeAfter')}</p>
                  </div>
                </Link>
              ))}
          </div>
        </section>
      )}

      {rates.length > 0 && focus && (
        <Link href="/book" className="btn-dark w-full sm:w-auto">
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
    <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-surface text-muted">
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="16" rx="2.5" />
        <circle cx="9" cy="10" r="1.8" />
        <path d="m21 16-5-5-9 9" />
      </svg>
      <span className="sr-only">{noPhoto}</span>
    </span>
  );
}

function FocusCard({
  row,
  isPast,
  upcoming,
  rateHref,
  tracking,
  locale,
  t,
}: {
  row: AccountBooking;
  isPast: boolean;
  upcoming: boolean;
  rateHref: string | null;
  tracking: TrackingState | null;
  locale: Locale;
  t: T;
}) {
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

  const settled = status === 'COMPLETE';
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-card" aria-labelledby={`focus-${booking.id}`}>
      <div className="p-5 sm:p-7">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className={`ct-status ${settled ? 'ct-status-done' : ''}`}>{heading}</p>
            <h2 id={`focus-${booking.id}`} className="ct-hero mt-2">{formatDateLabel(booking.slotStart.slice(0, 10), locale)}</h2>
          </div>
        </div>
        <p className="money mt-1.5 font-semibold text-ink">{formatSlotLabel(booking.slotStart, booking.slotEnd, locale)}</p>
        <p className="money text-slate">
          {serviceName(row, locale, t)}
          {booking.priceCents != null ? ` · ${formatMoney(booking.priceCents)}` : ''}
        </p>
        {row.address && <p className="ct-meta mt-0.5">{row.address.line1}, {row.address.city}</p>}
        <div className="mt-7">
          <JourneyRail steps={cleaningJourney(row, locale)} />
        </div>
        {upcoming && (
          <div className="mt-5 flex flex-col items-start gap-1 border-t border-line pt-4">
            {(!status || status === 'PENDING') && (
              <div className="mb-1">
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
              </div>
            )}
            <Link href="/account/settings#bookings" className="ct-action">{t('dashReschedule')}</Link>
            <TeamNoteButton bookingId={booking.id} initial={booking.clientNotes ?? null} />
          </div>
        )}
        {job && tracking?.status === 'EN_ROUTE' && (
          <div className="mt-6">
            <LiveTrackingMap jobId={job.id} token={publicMapboxToken()} initial={tracking} />
          </div>
        )}
      </div>
      {status === 'COMPLETE' && job && (
        <Link href={`/account/jobs/${job.id}`} className="group flex items-center gap-4 border-t border-line px-5 py-4 transition-colors hover:bg-surface sm:px-7">
          <Thumb url={row.cover} noPhoto={t('homeNoPhoto')} />
          <div className="min-w-0 flex-1">
            <p className="ct-h3">{t('focusSeeBeforeAfter')}</p>
            <p className="ct-meta mt-0.5">
              {t(row.photoCount === 1 ? 'focusPhotosOne' : 'focusPhotosMany', { count: row.photoCount })}
              {row.videoCount ? ` · ${t(row.videoCount === 1 ? 'focusVideosOne' : 'focusVideosMany', { count: row.videoCount })}` : ''}
            </p>
          </div>
          <Chevron />
        </Link>
      )}
      {rateHref && (
        <Link href={rateHref} className="flex min-h-[56px] items-center justify-between gap-3 border-t border-line px-5 py-3 text-[15px] font-semibold text-bronze transition-colors hover:bg-surface sm:px-7">
          {t('dashRate')}
          <Chevron />
        </Link>
      )}
      {invoice && (
        <Link href={`/account/invoices/${invoice.id}`} className="flex min-h-[56px] items-center justify-between gap-3 border-t border-line px-5 py-3 transition-colors hover:bg-surface sm:px-7">
          <span className="text-[15px] text-slate">
            {invoiceLabel(invoice)} · <span className="money font-semibold text-ink">{formatMoney(invoice.totalCents)}</span>
          </span>
          <span className="flex items-center gap-2">
            {invoice.status === 'PAID' ? (
              <span className="ct-status ct-status-done">{t('pillPaid')}</span>
            ) : (
              <span className="text-[15px] font-semibold text-bronze">{t('focusViewAndPay')}</span>
            )}
            <Chevron />
          </span>
        </Link>
      )}
      {status === 'IN_PROGRESS' && (
        <p className="border-t border-line bg-cream px-5 py-3 text-[15px] text-slate sm:px-7">
          {t('focusPhotosSoon')}
        </p>
      )}
    </section>
  );
}

function Chevron() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}
