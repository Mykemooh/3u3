import Link from 'next/link';
import { formatMoney } from '@/lib/format';
import { formatDateLabel, formatSlotLabel } from '@/lib/scheduling';
import TeamNoteButton from '@/components/account/TeamNoteButton';
import ReferralLink from '@/components/account/ReferralLink';
import { getLocale } from '@/lib/i18n/server';
import { translator } from '@/lib/i18n';
import { accountMessages } from '@/lib/i18n/messages/account';

type Props = {
  next: { bookingId: string; slotStart: string; slotEnd: string; serviceName: string; note: string | null; onTheWay: boolean } | null;
  openQuotes: { id: string; href: string | null; totalCents: number; status: string }[];
  lastClean: { jobId: string; date: string; photoCount: number; reviewed: boolean } | null;
  balanceCents: number;
  unpaidHref: string | null;
  /** Has a card pay link; otherwise the invoice page explains how to pay. */
  unpaidPayOnline?: boolean;
  canBook: boolean;
  /** The last clean is already the page's cleaning card — don't repeat it here. */
  lastInFocus?: boolean;
  /** The next clean (or the invitation to book one) is already the page's cleaning card. */
  nextInFocus?: boolean;
  referral: { link: string; rewardCents: number; creditCents: number } | null;
};

/**
 * One item of the at-a-glance panel: a plain label, the answer in the
 * heading face, a line of context, then what you can do about it. The
 * items share one panel split by hairlines — the cleaning card above is
 * the page's hero, so these stay quiet.
 */
function Card({ title, big, sub, children }: { title: string; big: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col bg-white px-5 py-5">
      <p className="ct-label">{title}</p>
      <p className="ct-h2 money mt-1">{big}</p>
      {sub && <p className="ct-meta mt-0.5">{sub}</p>}
      {children && <div className="mt-3 flex flex-col items-start">{children}</div>}
    </div>
  );
}

/**
 * The client portal's dashboard: when is my next clean, is anything
 * waiting on me, how did the last one go, and do I owe anything — each
 * card with the one or two things a client actually does from it.
 */
export default async function ClientDashboard(p: Props) {
  const locale = await getLocale();
  const t = translator(accountMessages, locale);
  return (
    <section aria-label={t('dashAria')} className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 sm:[&>*:last-child:nth-child(odd)]:col-span-2">
      {!p.nextInFocus && <Card
        title={t('dashNextTitle')}
        big={p.next ? formatDateLabel(p.next.slotStart.slice(0, 10), locale) : t('dashNothingBooked')}
        sub={p.next ? `${formatSlotLabel(p.next.slotStart, p.next.slotEnd, locale)} · ${p.next.serviceName}` : undefined}
      >
        {p.next ? (
          <>
            {p.next.onTheWay && <p className="ct-status ct-status-done mb-1">{t('dashOnTheWay')}</p>}
            <Link href="/account/settings#bookings" className="ct-action">{t('dashReschedule')}</Link>
            <TeamNoteButton bookingId={p.next.bookingId} initial={p.next.note} />
          </>
        ) : p.canBook ? (
          <Link href="/book" className="ct-action">{t('bookACleaning')}</Link>
        ) : (
          <p className="ct-meta">{t('dashCanBookLater')}</p>
        )}
      </Card>}

      <Card
        title={t('dashQuotesTitle')}
        big={p.openQuotes.length ? t(p.openQuotes.length === 1 ? 'dashQuotesWaitingOne' : 'dashQuotesWaitingMany', { count: p.openQuotes.length }) : t('dashAllAnswered')}
        sub={p.openQuotes.length ? t('dashQuotesSub') : undefined}
      >
        {p.openQuotes.length === 0 ? (
          <Link href="/new" className="ct-action">{t('dashRequestQuote')}</Link>
        ) : (
          p.openQuotes.slice(0, 2).map((q) =>
            q.href ? (
              <Link key={q.id} href={q.href} className="ct-action self-stretch justify-between">
                <span>{t('dashReviewQuote')}</span>
                <span className="money text-ink">{formatMoney(q.totalCents)}</span>
              </Link>
            ) : null,
          )
        )}
      </Card>

      {!p.lastInFocus && p.lastClean && <Card
        title={t('dashLastTitle')}
        big={p.lastClean ? formatDateLabel(p.lastClean.date, locale) : t('dashNotYet')}
        sub={p.lastClean ? t(p.lastClean.photoCount === 1 ? 'dashPhotosOne' : 'dashPhotosMany', { count: p.lastClean.photoCount }) : undefined}
      >
        {p.lastClean && (
          <>
            <Link href={`/account/jobs/${p.lastClean.jobId}`} className="ct-action">{t('dashSeeBeforeAfter')}</Link>
            {!p.lastClean.reviewed && (
              <Link href={`/account/jobs/${p.lastClean.jobId}#rate`} className="ct-action">{t('dashRate')}</Link>
            )}
          </>
        )}
      </Card>}

      <Card title={t('dashBillingTitle')} big={formatMoney(p.balanceCents)} sub={p.balanceCents ? t('dashDueNow') : t('dashNothingOwed')}>
        {p.unpaidHref && <Link href={p.unpaidHref} className="ct-action">{p.unpaidPayOnline ? t('dashPayNow') : t('jobViewInvoice')}</Link>}
        <Link href="/account/invoices" className="ct-action">{t('dashInvoicesReceipts')}</Link>
        <Link href="/account/settings#payment" className="ct-action font-medium text-slate">{t('dashCardAutopay')}</Link>
      </Card>

      {p.referral && (
        <div className="sm:col-span-2">
          <Card
            title={t('dashReferTitle')}
            big={t('dashReferBig', { amount: formatMoney(p.referral.rewardCents) })}
            sub={
              p.referral.creditCents > 0
                ? t('dashReferCredit', { amount: formatMoney(p.referral.creditCents) })
                : t('dashReferHow')
            }
          >
            <ReferralLink link={p.referral.link} />
          </Card>
        </div>
      )}
    </section>
  );
}
