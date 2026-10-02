import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { getPayrollReport } from '@/lib/payroll';
import { businessTodayISO } from '@/lib/time';
import { formatMoney } from '@/lib/data';

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
  const rows = await getPayrollReport(user.tenantId, start, end);
  const totalPayCents = rows.reduce((sum, r) => sum + (r.payCents ?? 0), 0);
  const missingRate = rows.some((r) => r.payRateCentsPerHour == null);

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Admin</p>
        <h1 className="mt-1 text-3xl font-extrabold">Payroll</h1>
        <p className="mt-2 text-slate">
          Hours worked, from real clock-in/clock-out times on completed jobs, times each cleaner's hourly rate
          (set on their Team page). Export the CSV below and hand it to whichever payroll processor you use —
          there's no fully free processor API to run real paychecks through yet, so this is the input, not the
          payment itself.
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
          Update
        </button>
        <a href={`/api/admin/payroll/export?start=${start}&end=${end}`} className="btn-primary">
          Export CSV
        </a>
      </form>

      {missingRate && (
        <p className="rounded-xl bg-cream px-4 py-3 text-sm text-bronze">
          Some cleaners below have no hourly rate set yet — add one on their Team page to see their pay.
        </p>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b-2 border-ink text-xs uppercase tracking-wide text-muted">
              <th className="pb-2 font-bold">Cleaner</th>
              <th className="pb-2 text-right font-bold">Jobs</th>
              <th className="pb-2 text-right font-bold">Hours</th>
              <th className="pb-2 text-right font-bold">Rate</th>
              <th className="pb-2 text-right font-bold">Pay</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.employeeId} className="border-b border-line">
                <td className="py-3 font-semibold text-ink">{r.name}</td>
                <td className="py-3 text-right">{r.jobCount}</td>
                <td className="py-3 text-right tabular-nums">{r.hours.toFixed(2)}</td>
                <td className="py-3 text-right tabular-nums">{r.payRateCentsPerHour != null ? `${formatMoney(r.payRateCentsPerHour)}/hr` : '—'}</td>
                <td className="py-3 text-right tabular-nums">{r.payCents != null ? formatMoney(r.payCents) : '—'}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-muted">
                  No completed jobs in this range.
                </td>
              </tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={4} className="pt-3 text-right text-lg font-bold">
                  Total
                </td>
                <td className="pt-3 text-right text-lg font-bold tabular-nums">{formatMoney(totalPayCents)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
