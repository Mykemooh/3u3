import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { previewPayroll, listPayrollRuns, PAY_TYPE_LABELS, type PayType } from '@/lib/payroll';
import { businessTodayISO } from '@/lib/time';
import { formatMoney } from '@/lib/data';
import CreatePayrollRunButton from '@/components/admin/CreatePayrollRunButton';

export const dynamic = 'force-dynamic';

function daysAgoISO(days: number) {
  const d = new Date(businessTodayISO());
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export default async function AdminPayroll({ searchParams }: { searchParams: { start?: string; end?: string } }) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { tenantId?: string } | undefined;
  if (!user?.tenantId) redirect('/admin');

  const start = searchParams.start || daysAgoISO(14);
  const end = searchParams.end || businessTodayISO();
  const [preview, runs] = await Promise.all([previewPayroll(user.tenantId, start, end), listPayrollRuns(user.tenantId)]);
  const previewTotalCents = preview.reduce((sum, r) => sum + (r.payCents ?? 0) + r.tipCents, 0);
  const missingRate = preview.some((r) => r.rateCents == null);
  const payable = preview.filter((r) => r.rateCents != null);

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Admin</p>
        <h1 className="mt-1 text-3xl font-extrabold">Payroll</h1>
        <p className="mt-2 text-slate">
          Preview a pay period, then create a run to lock it in for review and mark it paid. A job is never
          counted twice — once it's in a run (reviewed or paid), it won't show up again in a later one.
        </p>
      </div>

      <form className="card flex flex-wrap items-end gap-3" method="get">
        <div>
          <label className="label">From</label>
          <input type="date" name="start" defaultValue={start} className="input" />
        </div>
        <div>
          <label className="label">To</label>
          <input type="date" name="end" defaultValue={end} className="input" />
        </div>
        <button type="submit" className="btn-secondary">
          Preview
        </button>
      </form>

      {missingRate && (
        <p className="rounded-xl bg-cream px-4 py-3 text-sm text-bronze">
          Some cleaners below have no pay rate set yet — add one on their Team page to include them in a run.
        </p>
      )}

      <div className="card overflow-x-auto">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-ink">Preview: {start} to {end}</h2>
          {payable.length > 0 && <CreatePayrollRunButton start={start} end={end} />}
        </div>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b-2 border-ink text-xs uppercase tracking-wide text-muted">
              <th className="pb-2 font-bold">Cleaner</th>
              <th className="pb-2 font-bold">Pay type</th>
              <th className="pb-2 text-right font-bold">Hours</th>
              <th className="pb-2 text-right font-bold">Jobs</th>
              <th className="pb-2 text-right font-bold">Days</th>
              <th className="pb-2 text-right font-bold">Pay</th>
              <th className="pb-2 text-right font-bold">Tips</th>
              <th className="pb-2 text-right font-bold">Total</th>
            </tr>
          </thead>
          <tbody>
            {preview.map((r) => (
              <tr key={r.employeeId} className="border-b border-line">
                <td className="py-3 font-semibold text-ink">{r.name}</td>
                <td className="py-3 text-slate">{PAY_TYPE_LABELS[r.payType]}</td>
                <td className="py-3 text-right tabular-nums">{r.hours.toFixed(2)}</td>
                <td className="py-3 text-right tabular-nums">{r.jobCount}</td>
                <td className="py-3 text-right tabular-nums">{r.daysWorked}</td>
                <td className="py-3 text-right tabular-nums">{r.payCents != null ? formatMoney(r.payCents) : '— no rate set'}</td>
                <td className="py-3 text-right tabular-nums">{r.tipCents > 0 ? formatMoney(r.tipCents) : '—'}</td>
                <td className="py-3 text-right tabular-nums font-semibold">{formatMoney((r.payCents ?? 0) + r.tipCents)}</td>
              </tr>
            ))}
            {preview.length === 0 && (
              <tr>
                <td colSpan={8} className="py-6 text-center text-muted">
                  No unpaid completed jobs in this range.
                </td>
              </tr>
            )}
          </tbody>
          {payable.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={7} className="pt-3 text-right text-lg font-bold">
                  Total
                </td>
                <td className="pt-3 text-right text-lg font-bold tabular-nums">{formatMoney(previewTotalCents)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <div className="card">
        <h2 className="mb-3 font-semibold text-ink">Payroll runs</h2>
        <div className="space-y-2">
          {runs.map((run) => (
            <Link
              key={run.id}
              href={`/admin/payroll/${run.id}`}
              className="flex items-center justify-between rounded-xl border border-line px-4 py-3 text-sm transition hover:border-gold hover:bg-cream/60"
            >
              <div>
                <p className="font-semibold text-ink">{run.label}</p>
                <p className="text-muted">{run.periodStart} to {run.periodEnd}</p>
              </div>
              <span className={`pill ${run.status === 'PAID' ? 'bg-green/15 text-green' : 'bg-gold/15 text-bronze'}`}>
                {run.status === 'PAID' ? 'Paid' : 'Open'}
              </span>
            </Link>
          ))}
          {runs.length === 0 && <p className="text-sm text-muted">No payroll runs yet.</p>}
        </div>
      </div>
    </div>
  );
}
