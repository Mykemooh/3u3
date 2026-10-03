import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { redirect, notFound } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { getPayrollRun, PAY_TYPE_LABELS, type PayType } from '@/lib/payroll';
import { formatMoney } from '@/lib/data';
import PayrollRunActions from '@/components/admin/PayrollRunActions';

export const dynamic = 'force-dynamic';

export default async function PayrollRunDetail({ params }: { params: { runId: string } }) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { tenantId?: string } | undefined;
  if (!user?.tenantId) redirect('/admin');

  const data = await getPayrollRun(user.tenantId, params.runId);
  if (!data) notFound();
  const { run, rows, totalCents } = data;

  return (
    <div className="space-y-6">
      <Link href="/admin/payroll" className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink">
        <span aria-hidden="true">←</span> Payroll
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">{run.periodStart} to {run.periodEnd}</p>
          <h1 className="mt-1 text-3xl font-extrabold">{run.label}</h1>
        </div>
        <span className={`pill ${run.status === 'PAID' ? 'bg-green/15 text-green' : 'bg-gold/15 text-bronze'}`}>
          {run.status === 'PAID' ? `Paid ${run.paidAt?.toLocaleDateString()}` : 'Open — not yet paid'}
        </span>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b-2 border-ink text-xs uppercase tracking-wide text-muted">
              <th className="pb-2 font-bold">Cleaner</th>
              <th className="pb-2 font-bold">Pay type</th>
              <th className="pb-2 text-right font-bold">Hours</th>
              <th className="pb-2 text-right font-bold">Jobs</th>
              <th className="pb-2 text-right font-bold">Days</th>
              <th className="pb-2 text-right font-bold">Rate</th>
              <th className="pb-2 text-right font-bold">Pay</th>
              <th className="pb-2 text-right font-bold">Tips</th>
              <th className="pb-2 text-right font-bold">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.entry.id} className="border-b border-line">
                <td className="py-3 font-semibold text-ink">{r.name}</td>
                <td className="py-3 text-slate">{PAY_TYPE_LABELS[r.entry.payType as PayType]}</td>
                <td className="py-3 text-right tabular-nums">{r.entry.hours.toFixed(2)}</td>
                <td className="py-3 text-right tabular-nums">{r.entry.jobCount}</td>
                <td className="py-3 text-right tabular-nums">{r.entry.daysWorked}</td>
                <td className="py-3 text-right tabular-nums">
                  {r.entry.payType === 'PERCENTAGE' ? `${((r.entry.ratePercentBps ?? 0) / 100).toFixed(2)}%` : formatMoney(r.entry.rateCents)}
                </td>
                <td className="py-3 text-right tabular-nums">{formatMoney(r.entry.payCents)}</td>
                <td className="py-3 text-right tabular-nums">{r.entry.tipCents > 0 ? formatMoney(r.entry.tipCents) : '—'}</td>
                <td className="py-3 text-right tabular-nums font-semibold">{formatMoney(r.entry.payCents + r.entry.tipCents)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={8} className="pt-3 text-right text-lg font-bold">
                Total
              </td>
              <td className="pt-3 text-right text-lg font-bold tabular-nums">{formatMoney(totalCents)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <PayrollRunActions runId={run.id} status={run.status} />
    </div>
  );
}
