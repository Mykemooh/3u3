import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { notFound, redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { getInvoiceWithItems, invoiceLabel } from '@/lib/invoices';
import { formatMoney } from '@/lib/data';
import { serviceName as serviceLabel } from '@/lib/format';
import { formatSlotDateLong } from '@/lib/time';
import { db } from '@/db/client';
import { jobs } from '@/db/schema';
import { eq } from 'drizzle-orm';
import PrintButton from '@/components/account/PrintButton';
import TipButton from '@/components/account/TipButton';
import { getLocale } from '@/lib/i18n/server';
import { translator, intlLocale } from '@/lib/i18n';
import { accountMessages } from '@/lib/i18n/messages/account';
import type { Locale } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

function formatPhone(phone: string) {
  const d = phone.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : phone;
}

function longDate(d: Date | null | undefined, locale: Locale) {
  return d ? d.toLocaleDateString(intlLocale(locale), { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago' }) : '—';
}

export default async function InvoiceView({ params, searchParams }: { params: { id: string }; searchParams: { tip?: string } }) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string; role?: string } | undefined;
  if (!user?.id) redirect(`/signin?next=/account/invoices/${params.id}`);

  const locale = await getLocale();
  const t = translator(accountMessages, locale);
  const data = await getInvoiceWithItems(params.id);
  if (!data) notFound();
  const { invoice, items, client, booking, address, service, brand } = data;
  // A client sees only their own invoices, and only once sent — a draft is
  // the office's working copy.
  if (user.role !== 'ADMIN' && (invoice.clientId !== user.id || invoice.status === 'DRAFT' || invoice.status === 'VOID')) notFound();

  const job = booking ? (await db.select().from(jobs).where(eq(jobs.bookingId, booking.id)).limit(1))[0] : undefined;
  const issued = invoice.sentAt ?? invoice.createdAt;
  const dueDate = new Date(issued.getTime() + 7 * 24 * 60 * 60 * 1000);
  // The tip has its own dedicated row below — never counted in the
  // billable subtotal/total, which stays "what the business charged".
  const billableItems = items.filter((i) => !i.isTip);
  const subtotal = billableItems.reduce((s, i) => s + i.amountCents, 0);
  const serviceName = service ? serviceLabel(service.key, service.name, locale) : t('invServiceFallback');

  return (
    <div className="space-y-5">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link
          href={user.role === 'ADMIN' ? `/admin/invoices/${invoice.id}` : '/account/invoices'}
          className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink"
        >
          <span aria-hidden="true">←</span> {user.role === 'ADMIN' ? t('invBackAdmin') : t('allInvoices')}
        </Link>
        <div className="flex flex-wrap gap-2">
          {invoice.status === 'SENT' && invoice.hostedInvoiceUrl && user.role !== 'ADMIN' && (
            <a href={invoice.hostedInvoiceUrl} target="_blank" rel="noreferrer" className="btn-primary btn-sm">
              {t('payAmount', { amount: formatMoney(invoice.totalCents) })}
            </a>
          )}
          {job && (
            <Link href={`/account/jobs/${job.id}`} className="btn-secondary btn-sm">
              {t('invBeforeAfter')}
            </Link>
          )}
          <PrintButton />
        </div>
      </div>

      {user.role === 'ADMIN' && invoice.status === 'DRAFT' && (
        <p className="no-print rounded-xl bg-cream px-4 py-3 text-sm text-bronze">
          {t('invDraftPreview')}
        </p>
      )}

      {searchParams.tip === 'thanks' && (
        <p className="no-print rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          {t('invTipThanks')}
        </p>
      )}

      <article className="print-sheet overflow-hidden rounded-2xl border border-line bg-white shadow-card">
        <header className="flex items-center justify-between gap-4 bg-ink px-6 py-5 text-white sm:px-8">
          {brand.logoUrl ? (
            <img src={brand.logoUrl} alt={brand.name} className="h-auto max-h-12 w-auto" />
          ) : (
            <img src="/brand/logo-640.png" alt={brand.name} className="h-auto w-36 sm:w-44" />
          )}
          <div className="text-right">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-gold">{t('invHeader')}</p>
            <p className="mt-1 text-xl font-bold text-white">{invoiceLabel(invoice)}</p>
          </div>
        </header>
        <div className="flow-line" aria-hidden="true" />

        <div className="space-y-8 px-6 py-7 sm:px-8">
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-muted">{t('invBilledTo')}</p>
              <p className="mt-1 font-semibold">{client?.name}</p>
              {address && (
                <p className="text-slate">
                  {address.line1}
                  <br />
                  {address.city}, {address.state} {address.zip ?? ''}
                </p>
              )}
              {client?.email && <p className="text-slate">{client.email}</p>}
              {client?.phone && <p className="text-slate">{formatPhone(client.phone)}</p>}
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:text-right">
              <dt className="text-muted">{t('invServiceDate')}</dt>
              <dd className="font-semibold">{booking ? formatSlotDateLong(booking.slotStart, locale) : '—'}</dd>
              <dt className="text-muted">{t('invIssued')}</dt>
              <dd className="font-semibold">{longDate(issued, locale)}</dd>
              <dt className="text-muted">{invoice.status === 'PAID' ? t('invDtPaid') : t('invDtDue')}</dt>
              <dd className="font-semibold">{invoice.status === 'PAID' ? longDate(invoice.paidAt, locale) : longDate(dueDate, locale)}</dd>
              <dt className="text-muted">{t('invService')}</dt>
              <dd className="font-semibold">{serviceName}</dd>
            </dl>
          </div>

          <table className="w-full text-left">
            <thead>
              <tr className="border-b-2 border-ink text-xs uppercase tracking-wide text-muted">
                <th className="pb-2 font-bold">{t('invDescription')}</th>
                <th className="pb-2 text-right font-bold">{t('amount')}</th>
              </tr>
            </thead>
            <tbody>
              {billableItems.map((item) => (
                <tr key={item.id} className="border-b border-line">
                  <td className="py-3 pr-4">{item.description}</td>
                  <td className="py-3 text-right tabular-nums">{formatMoney(item.amountCents)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="pt-4 text-right text-slate">{t('invSubtotal')}</td>
                <td className="pt-4 text-right tabular-nums">{formatMoney(subtotal)}</td>
              </tr>
              <tr>
                <td className="pt-2 text-right text-lg font-bold">{t('total')}</td>
                <td className="pt-2 text-right text-lg font-bold tabular-nums">{formatMoney(invoice.totalCents)}</td>
              </tr>
              {invoice.tipCents > 0 && (
                <tr>
                  <td className="pt-1 text-right text-slate">{t('invTip')}</td>
                  <td className="pt-1 text-right tabular-nums text-slate">{formatMoney(invoice.tipCents)}</td>
                </tr>
              )}
            </tfoot>
          </table>

          {invoice.status === 'PAID' ? (
            <p className="inline-flex rounded-full border-2 border-green px-4 py-1 text-sm font-bold uppercase tracking-wide text-green">{t('invPaidThanks')}</p>
          ) : (
            <p className="text-sm text-slate">{t('invDueTerms')}</p>
          )}

          <footer className="border-t border-line pt-5 text-sm text-muted">
            <p className="font-semibold text-slate">{brand.name}{brand.tagline ? ` — ${brand.tagline}` : ''}</p>
            <p>{t('thanksForTrusting')}</p>
          </footer>
        </div>
      </article>

      <div className="no-print flex flex-wrap items-start gap-2">
        {invoice.status === 'SENT' && invoice.hostedInvoiceUrl && (
          <a href={invoice.hostedInvoiceUrl} target="_blank" rel="noreferrer" className="btn-primary">
            {t('payAmount', { amount: formatMoney(invoice.totalCents) })}
          </a>
        )}
        {invoice.status === 'PAID' && invoice.receiptUrl && (
          <a href={invoice.receiptUrl} target="_blank" rel="noreferrer" className="btn-secondary">
            {t('cardReceipt')}
          </a>
        )}
        {invoice.status === 'PAID' && user.role !== 'ADMIN' && <TipButton invoiceId={invoice.id} />}
      </div>
    </div>
  );
}
