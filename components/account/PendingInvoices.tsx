import Link from 'next/link';
import { formatMoney } from '@/lib/data';
import type { PendingInvoiceRow } from '@/lib/account';

export default function PendingInvoices({ invoices }: { invoices: PendingInvoiceRow[] }) {
  if (invoices.length === 0) {
    return <p className="text-sm text-muted">Nothing pending — you're all caught up.</p>;
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
            <p className="text-muted">Sent {inv.dateLabel}</p>
          </div>
          <div className="text-right">
            <p className="font-bold text-bronze">{formatMoney(inv.amountCents)}</p>
            <p className="text-xs font-semibold text-bronze">View and pay →</p>
          </div>
        </Link>
      ))}
    </div>
  );
}
