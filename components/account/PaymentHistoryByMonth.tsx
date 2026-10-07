import { formatMoney } from '@/lib/data';
import type { PaymentMonthGroup } from '@/lib/account';
import { getT } from '@/lib/i18n/server';
import { accountMessages } from '@/lib/i18n/messages/account';

export default async function PaymentHistoryByMonth({ months }: { months: PaymentMonthGroup[] }) {
  const t = await getT(accountMessages);
  if (months.length === 0) {
    return <p className="text-[15px] text-muted">{t('historyNone')}</p>;
  }
  return (
    <div className="space-y-2">
      {months.map((month, i) => (
        <details key={month.monthKey} className="group rounded-xl border border-line" open={i === 0}>
          <summary className="flex min-h-[48px] cursor-pointer list-none items-center justify-between px-4 py-3 text-[15px]">
            <span className="font-semibold text-ink">{month.monthLabel}</span>
            <span className="money flex items-center gap-2 text-slate">
              {formatMoney(month.totalCents)}
              <svg viewBox="0 0 24 24" className="h-4 w-4 text-muted transition group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
            </span>
          </summary>
          <div className="space-y-2 border-t border-line px-4 py-3">
            {month.invoices.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between gap-3 text-[15px]">
                <span className="text-slate">
                  {inv.dateLabel} · {inv.label}
                </span>
                <span className="flex items-center gap-2">
                  <span className="money text-ink">{formatMoney(inv.amountCents)}</span>
                  {inv.receiptUrl && (
                    <a href={inv.receiptUrl} target="_blank" rel="noreferrer" className="text-sm font-semibold text-bronze hover:underline">
                      {t('historyReceipt')}
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
