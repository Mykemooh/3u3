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
  canBook: boolean;
  referral: { link: string; rewardCents: number; creditCents: number } | null;
};

function Card({ title, big, sub, children }: { title: string; big: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-white p-5">
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1" style={{ backgroundImage: 'linear-gradient(90deg,#016AEE,#2DBD91)' }} />
      <p className="text-sm font-semibold text-slate">{title}</p>
      <p className="mt-1 font-display text-2xl font-extrabold tracking-tight text-ink">{big}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
      {children && <div className="mt-3 space-y-1.5 border-t border-line pt-3 text-sm">{children}</div>}
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
    <section aria-label={t('dashAria')} className="grid gap-3 sm:grid-cols-2">
      <Card
        title={t('dashNextTitle')}
        big={p.next ? formatDateLabel(p.next.slotStart.slice(0, 10), locale) : t('dashNothingBooked')}
        sub={p.next ? `${formatSlotLabel(p.next.slotStart, p.next.slotEnd, locale)} · ${p.next.serviceName}` : undefined}
      >
        {p.next ? (
          <>
            {p.next.onTheWay && <p className="font-semibold text-green">{t('dashOnTheWay')}</p>}
            <Link href="/account/settings#bookings" className="block font-semibold text-bronze hover:underline">{t('dashReschedule')}</Link>
            <TeamNoteButton bookingId={p.next.bookingId} initial={p.next.note} />
          </>
        ) : p.canBook ? (
          <Link href="/book" className="block font-semibold text-bronze hover:underline">{t('bookACleaning')}</Link>
        ) : (
          <p className="text-muted">{t('dashCanBookLater')}</p>
        )}
      </Card>

      <Card
        title={t('dashQuotesTitle')}
        big={p.openQuotes.length ? t(p.openQuotes.length === 1 ? 'dashQuotesWaitingOne' : 'dashQuotesWaitingMany', { count: p.openQuotes.length }) : t('dashAllAnswered')}
        sub={p.openQuotes.length ? t('dashQuotesSub') : undefined}
      >
        {p.openQuotes.length === 0 ? (
          <Link href="/new" className="block font-semibold text-bronze hover:underline">{t('dashRequestQuote')}</Link>
        ) : (
          p.openQuotes.slice(0, 2).map((q) =>
            q.href ? (
              <Link key={q.id} href={q.href} className="flex justify-between font-semibold text-bronze hover:underline">
                <span>{t('dashReviewQuote')}</span>
                <span>{formatMoney(q.totalCents)}</span>
              </Link>
            ) : null,
          )
        )}
      </Card>

      <Card
        title={t('dashLastTitle')}
        big={p.lastClean ? formatDateLabel(p.lastClean.date, locale) : t('dashNotYet')}
        sub={p.lastClean ? t(p.lastClean.photoCount === 1 ? 'dashPhotosOne' : 'dashPhotosMany', { count: p.lastClean.photoCount }) : undefined}
      >
        {p.lastClean && (
          <>
            <Link href={`/account/jobs/${p.lastClean.jobId}`} className="block font-semibold text-bronze hover:underline">{t('dashSeeBeforeAfter')}</Link>
            {!p.lastClean.reviewed && (
              <Link href={`/account/jobs/${p.lastClean.jobId}#rate`} className="block font-semibold text-bronze hover:underline">{t('dashRate')}</Link>
            )}
          </>
        )}
      </Card>

      <Card title={t('dashBillingTitle')} big={formatMoney(p.balanceCents)} sub={p.balanceCents ? t('dashDueNow') : t('dashNothingOwed')}>
        {p.unpaidHref && <Link href={p.unpaidHref} className="block font-semibold text-bronze hover:underline">{t('dashPayNow')}</Link>}
        <Link href="/account/invoices" className="block font-semibold text-bronze hover:underline">{t('dashInvoicesReceipts')}</Link>
        <Link href="/account/settings#payment" className="block text-slate hover:text-ink">{t('dashCardAutopay')}</Link>
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
