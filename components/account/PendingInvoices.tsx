import Link from 'next/link';
import { formatMoney } from '@/lib/data';
import type { PendingInvoiceRow } from '@/lib/account';
import { getT } from '@/lib/i18n/server';
import { accountMessages } from '@/lib/i18n/messages/account';

export default async function PendingInvoices({ invoices }: { invoices: PendingInvoiceRow[] }) {
  const t = await getT(accountMessages);
  if (invoices.length === 0) {
    return <p className="text-sm text-muted">{t('pendingNone')}</p>;
  }
  return (
    <div className="space-y-2">
      {invoices.map((inv) => (
        <Link
          key={inv.id}
          href={`/account/invoices/${inv.id}`}
          className="flex items-center justify-between gap-3 rounded-xl border border-gold/40 bg-gold/5 px-4 py-3 text-sm transition hover:border-gold hover:bg-gold/10"
        >
          <div>
            <p className="font-semibold text-ink">{inv.label}</p>
            <p className="text-muted">{t('pendingSent', { date: inv.dateLabel })}</p>
          </div>
          <div className="text-right">
            <p className="font-bold text-bronze">{formatMoney(inv.amountCents)}</p>
            <p className="text-xs font-semibold text-bronze">{t('pendingViewPay')}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}
