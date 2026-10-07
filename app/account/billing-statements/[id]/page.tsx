import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { notFound, redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { getMonthlyBatchWithInvoices } from '@/lib/monthlyBilling';
import { brandFor } from '@/lib/invoices';
import { formatMoney } from '@/lib/data';
import { formatSlotDateLong } from '@/lib/time';
import Logo from '@/components/Logo';
import PrintButton from '@/components/account/PrintButton';
import { getLocale } from '@/lib/i18n/server';
import { translator, intlLocale } from '@/lib/i18n';
import { accountMessages } from '@/lib/i18n/messages/account';
import type { Locale } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

function longDate(d: Date | null | undefined, locale: Locale) {
  return d ? d.toLocaleDateString(intlLocale(locale), { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago' }) : '—';
}

export default async function BillingStatementView({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string; role?: string } | undefined;
  if (!user?.id) redirect(`/signin?next=/account/billing-statements/${params.id}`);

  const locale = await getLocale();
  const t = translator(accountMessages, locale);
  const data = await getMonthlyBatchWithInvoices(params.id);
  if (!data) notFound();
  const { batch, rows } = data;
  if (user.role !== 'ADMIN' && (batch.clientId !== user.id || batch.status === 'OPEN')) notFound();

  const brand = await brandFor(batch.tenantId);

  return (
    <div className="space-y-5">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link href="/account/invoices" className="ct-action text-slate">
          <span aria-hidden="true">←</span> {t('allInvoices')}
        </Link>
        <div className="flex flex-wrap gap-2">
          {batch.status === 'INVOICED' && batch.hostedInvoiceUrl && (
            <a href={batch.hostedInvoiceUrl} target="_blank" rel="noreferrer" className="btn-primary btn-sm">
              {t('payAmount', { amount: formatMoney(batch.totalCents) })}
            </a>
          )}
          <PrintButton />
        </div>
      </div>

      <article className="print-sheet overflow-hidden rounded-2xl border border-line bg-white shadow-card">
        <header className="flex items-center justify-between gap-4 bg-ink px-6 py-5 text-white sm:px-8">
          <Logo variant="light" size="sm" />
          <div className="text-right">
            <p className="text-sm font-medium text-white/75">{t('invMonthlyStatement')}</p>
            <p className="font-display text-xl font-bold text-white">{t('periodRange', { start: batch.periodStart, end: batch.periodEnd })}</p>
          </div>
        </header>
        <div className="flow-line" aria-hidden="true" />

        <div className="space-y-8 px-6 py-7 sm:px-8">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-[15px]">
            <dt className="text-muted">{t('stmtIssued')}</dt>
            <dd className="font-semibold">{longDate(batch.invoicedAt, locale)}</dd>
            <dt className="text-muted">{batch.status === 'PAID' ? t('invDtPaid') : t('stmtStatus')}</dt>
            <dd className="font-semibold">{batch.status === 'PAID' ? longDate(batch.paidAt, locale) : batch.status === 'FAILED' ? t('stmtPaymentIssue') : t('stmtPillDue')}</dd>
          </dl>

          <table className="w-full text-left">
            <thead>
              <tr className="border-b-2 border-ink text-sm text-muted">
                <th className="pb-2 font-semibold">{t('stmtCleaning')}</th>
                <th className="pb-2 text-right font-semibold">{t('amount')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ invoice, booking }) => (
                <tr key={invoice.id} className="border-b border-line">
                  <td className="py-3 pr-4">{booking ? formatSlotDateLong(booking.slotStart, locale) : t('serviceFallback')}</td>
                  <td className="money py-3 text-right">{formatMoney(invoice.totalCents)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="pt-4 text-right font-display text-lg font-bold text-ink">{t('total')}</td>
                <td className="money pt-4 text-right text-lg font-bold text-ink">{formatMoney(batch.totalCents)}</td>
              </tr>
            </tfoot>
          </table>

          {batch.status === 'PAID' ? (
            <p className="ct-status ct-status-done rounded-full bg-green-light px-4 py-1.5 text-[15px]">{t('stmtPaidThanks')}</p>
          ) : (
            <p className="max-w-[60ch] text-[15px] text-slate">{t('stmtDueTerms')}</p>
          )}

          <footer className="border-t border-line pt-5 text-sm text-muted">
            <p className="font-semibold text-slate">{brand.name}{brand.tagline ? ` — ${brand.tagline}` : ''}</p>
            <p>{t('thanksForTrusting')}</p>
          </footer>
        </div>
      </article>

      <div className="no-print flex flex-wrap items-start gap-2">
        {batch.status === 'INVOICED' && batch.hostedInvoiceUrl && (
          <a href={batch.hostedInvoiceUrl} target="_blank" rel="noreferrer" className="btn-primary">
            {t('payAmount', { amount: formatMoney(batch.totalCents) })}
          </a>
        )}
        {batch.status === 'PAID' && batch.receiptUrl && (
          <a href={batch.receiptUrl} target="_blank" rel="noreferrer" className="btn-secondary">
            {t('cardReceipt')}
          </a>
        )}
      </div>
    </div>
  );
}
