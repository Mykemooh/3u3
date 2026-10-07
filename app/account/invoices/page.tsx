import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { getAccountBookings } from '@/lib/account';
import { formatMoney } from '@/lib/data';
import { serviceName } from '@/lib/format';
import { formatDateLabel } from '@/lib/scheduling';
import { invoiceLabel } from '@/lib/invoices';
import { getMonthlyBatchesForClient } from '@/lib/monthlyBilling';
import { getLocale } from '@/lib/i18n/server';
import { translator } from '@/lib/i18n';
import { accountMessages } from '@/lib/i18n/messages/account';

export const dynamic = 'force-dynamic';

export default async function AccountInvoices() {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id: string; role?: string };
  if (user.role === 'ADMIN') redirect('/admin/invoices');
  const locale = await getLocale();
  const t = translator(accountMessages, locale);

  // A monthly-batch client's per-visit invoice stays DRAFT (never
  // individually due) while its month is still accumulating — only
  // show one here once it's actually been sent or paid, as part of
  // that month's one combined statement below.
  const rows = (await getAccountBookings(user.id)).filter((r) => r.invoice && r.invoice.status !== 'DRAFT').reverse();
  const due = rows.filter((r) => r.invoice!.status === 'SENT');
  const batches = await getMonthlyBatchesForClient(user.id);

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">{t('invEyebrow')}</p>
        <h1 className="mt-1 text-3xl font-extrabold">{t('invTitle')}</h1>
        {due.length > 0 && (
          <p className="mt-2 text-slate">
            {t(due.length === 1 ? 'invDueOne' : 'invDueMany', { amount: formatMoney(due.reduce((s, r) => s + r.invoice!.totalCents, 0)), count: due.length })}
          </p>
        )}
      </div>

      {batches.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{t('invMonthlyStatements')}</h2>
          {batches.map((b) =>
            b.status === 'OPEN' ? (
              <div key={b.id} className="card flex items-center justify-between gap-4 p-5 opacity-70">
                <div>
                  <p className="font-semibold">{t('periodRange', { start: b.periodStart, end: b.periodEnd })}</p>
                  <p className="text-sm text-slate">{t('invAccumulating')}</p>
                </div>
                <span className="font-semibold text-bronze">{formatMoney(b.totalCents)}</span>
              </div>
            ) : (
              <Link key={b.id} href={`/account/billing-statements/${b.id}`} className="card-interactive flex items-center justify-between gap-4 p-5">
                <div>
                  <p className="font-semibold">{t('periodRange', { start: b.periodStart, end: b.periodEnd })}</p>
                  <p className="text-sm text-slate">{t('invMonthlyStatement')}</p>
                </div>
                <span className={`pill ${b.status === 'PAID' ? 'bg-emerald-100 text-green' : b.status === 'FAILED' ? 'bg-red-100 text-red-700' : 'bg-gold/20 text-bronze'}`}>
                  {b.status === 'PAID' ? t('stmtPillPaid') : b.status === 'FAILED' ? t('invPaymentIssue') : t('stmtPillDue')}
                </span>
              </Link>
            ),
          )}
        </div>
      )}

      {rows.length === 0 && batches.length === 0 ? (
        <p className="card text-slate">{t('invEmpty')}</p>
      ) : (
        rows.length > 0 && (
          <div className="space-y-3">
            {batches.length > 0 && <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{t('invPerVisit')}</h2>}
            {rows.map(({ invoice, booking, service }) => (
              <Link key={invoice!.id} href={`/account/invoices/${invoice!.id}`} className="card-interactive flex items-center justify-between gap-4 p-5">
                <div>
                  <p className="font-semibold">
                    {invoiceLabel(invoice!)} · {formatMoney(invoice!.totalCents)}
                  </p>
                  <p className="text-sm text-slate">
                    {service ? serviceName(service.key, service.name, locale) : t('serviceFallback')} · {formatDateLabel(booking.slotStart.slice(0, 10), locale)}
                  </p>
                </div>
                <span className={`pill ${invoice!.status === 'PAID' ? 'bg-emerald-100 text-green' : 'bg-gold/20 text-bronze'}`}>
                  {invoice!.status === 'PAID' ? t('pillPaid') : t('pillDue')}
                </span>
              </Link>
            ))}
          </div>
        )
      )}
    </div>
  );
}
