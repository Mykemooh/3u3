import { formatMoney } from '@/lib/data';
import type { PaymentMonthGroup } from '@/lib/account';

export default function PaymentHistoryByMonth({ months }: { months: PaymentMonthGroup[] }) {
  if (months.length === 0) {
    return <p className="text-sm text-muted">No payments yet.</p>;
  }
  return (
    <div className="space-y-2">
      {months.map((month, i) => (
        <details key={month.monthKey} className="group rounded-xl border border-line" open={i === 0}>
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm">
            <span className="font-semibold text-ink">{month.monthLabel}</span>
            <span className="flex items-center gap-2 text-muted">
              {formatMoney(month.totalCents)}
              <span className="transition group-open:rotate-180">▾</span>
            </span>
          </summary>
          <div className="space-y-1 border-t border-line px-4 py-3">
            {month.invoices.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between text-sm">
                <span className="text-slate">
                  {inv.dateLabel} · {inv.label}
                </span>
                <span className="flex items-center gap-2">
                  <span className="tabular-nums text-ink">{formatMoney(inv.amountCents)}</span>
                  {inv.receiptUrl && (
                    <a href={inv.receiptUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-bronze hover:underline">
                      Receipt
                    </a>
                  )}
                </span>
              </div>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}
