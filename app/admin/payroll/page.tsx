import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { previewPayroll, listPayrollRuns, PAY_TYPE_LABELS, type PayType } from '@/lib/payroll';
import { businessTodayISO } from '@/lib/time';
import { formatMoney } from '@/lib/data';
import CreatePayrollRunButton from '@/components/admin/CreatePayrollRunButton';
import PayrollPreviewTable from '@/components/admin/PayrollPreviewTable';

export const dynamic = 'force-dynamic';

function daysAgoISO(days: number) {
  const d = new Date(businessTodayISO());
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

const PERIOD_PRESETS = [
  { label: 'Weekly', days: 7 },
  { label: 'Bi-weekly', days: 14 },
  { label: 'Monthly', days: 30 },
] as const;

export default async function AdminPayroll({ searchParams }: { searchParams: { start?: string; end?: string } }) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { tenantId?: string } | undefined;
  if (!user?.tenantId) redirect('/admin');

  const today = businessTodayISO();
  const start = searchParams.start || daysAgoISO(14);
  const end = searchParams.end || today;
  const [preview, runs] = await Promise.all([previewPayroll(user.tenantId, start, end), listPayrollRuns(user.tenantId)]);
  const previewTotalCents = preview.reduce((sum, r) => sum + (r.payCents ?? 0) + r.tipCents, 0);
  const missingRate = preview.some((r) => r.rateCents == null);
  const payable = preview.filter((r) => r.rateCents != null);

  const totalHours = preview.reduce((s, r) => s + r.hours, 0);
  const totalJobs = preview.reduce((s, r) => s + r.jobCount, 0);
  const totalTips = preview.reduce((s, r) => s + r.tipCents, 0);
  const activePreset = PERIOD_PRESETS.find((p) => start === daysAgoISO(p.days) && end === today)?.label ?? 'Custom';
  const fmtDay = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-extrabold tracking-[-0.02em] text-tc-900">Payroll</h1>
          <p className="mt-1 max-w-[68ch] text-[15px] text-tc-700">
            Preview a pay period, then create a run to lock it in for review and mark it paid. A job is only ever paid once.
          </p>
        </div>
      </div>

      {/* Period: presets and a custom range in one bar */}
      <section className="flex flex-wrap items-end gap-4 rounded-2xl border border-tc-200 bg-white p-4 shadow-tc-ring" aria-label="Pay period">
        <div>
          <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-tc-500">Period</p>
          <div className="inline-flex rounded-xl bg-tc-100 p-1" role="group" aria-label="Quick period">
            {PERIOD_PRESETS.map((p) => {
              const active = activePreset === p.label;
              return (
                <Link
                  key={p.label}
                  href={`/admin/payroll?start=${daysAgoISO(p.days)}&end=${today}`}
                  aria-current={active ? 'true' : undefined}
                  className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition ${active ? 'bg-white text-tc-900 shadow-sm' : 'text-tc-500 hover:text-tc-900'}`}
                >
                  {p.label}
                </Link>
              );
            })}
            <span className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold ${activePreset === 'Custom' ? 'bg-white text-tc-900 shadow-sm' : 'text-tc-500'}`}>Custom</span>
          </div>
        </div>
        {/* key: picking a preset must refresh these boxes, not leave the old dates showing */}
        <form key={`${start}|${end}`} className="flex flex-wrap items-end gap-3" method="get">
          <div>
            <label htmlFor="pr-start" className="mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.08em] text-tc-500">
              From
            </label>
            <input id="pr-start" type="date" name="start" defaultValue={start} className="input !h-10 !py-0" />
          </div>
          <div>
            <label htmlFor="pr-end" className="mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.08em] text-tc-500">
              To
            </label>
            <input id="pr-end" type="date" name="end" defaultValue={end} className="input !h-10 !py-0" />
          </div>
          <button type="submit" className="h-10 rounded-lg bg-tc-black px-4 text-sm font-semibold text-white transition hover:bg-tc-black-3">
            Update preview
          </button>
        </form>
      </section>

      {/* At a glance */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Period totals">
        {(
          [
            ['To pay', formatMoney(previewTotalCents), `${fmtDay(start)} – ${fmtDay(end)}`],
            ['People', String(preview.length), missingRate ? `${preview.length - payable.length} without a rate` : 'all have a rate'],
            ['Hours', totalHours.toFixed(1), `${totalJobs} ${totalJobs === 1 ? 'job' : 'jobs'}`],
            ['Tips', formatMoney(totalTips), 'included in pay'],
          ] as const
        ).map(([label, value, sub], i) => (
          <div key={label} className={`rounded-2xl border p-4 ${i === 0 ? 'border-tc-black bg-tc-black text-white' : 'border-tc-200 bg-white shadow-tc-ring'}`}>
            <p className={`text-[12px] font-semibold uppercase tracking-[0.08em] ${i === 0 ? 'text-white/60' : 'text-tc-500'}`}>{label}</p>
            <p className={`mt-1.5 font-tc-display text-[26px] font-extrabold tabular-nums tracking-[-0.02em] ${i === 0 ? 'text-tc-lime' : 'text-tc-900'}`}>{value}</p>
            <p className={`mt-0.5 text-[12px] ${i === 0 ? 'text-white/60' : i === 1 && missingRate ? 'font-semibold text-amber-700' : 'text-tc-500'}`}>{sub}</p>
          </div>
        ))}
      </section>

      {missingRate && (
        <p className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-px shrink-0" aria-hidden="true">
            <path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
          </svg>
          <span>Some people have no pay rate yet, so they’re left out of a run. Use “Set a rate” next to their name.</span>
        </p>
      )}

      <PayrollPreviewTable
        rows={preview.map((r) => ({
          employeeId: r.employeeId,
          name: r.name,
          payTypeLabel: PAY_TYPE_LABELS[r.payType],
          hasRate: r.rateCents != null,
          hours: r.hours,
          jobCount: r.jobCount,
          daysWorked: r.daysWorked,
          payCents: r.payCents,
          tipCents: r.tipCents,
        }))}
        action={payable.length > 0 ? <CreatePayrollRunButton start={start} end={end} /> : undefined}
      />

      <section className="overflow-hidden rounded-2xl border border-tc-200 bg-white shadow-tc-ring" aria-labelledby="runs-h">
        <div className="border-b border-tc-200 px-5 py-4">
          <h2 id="runs-h" className="text-[16px] font-semibold text-tc-900">
            Payroll runs
          </h2>
          <p className="text-[13px] text-tc-500">Locked periods, newest first</p>
        </div>
        {runs.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-tc-500">No payroll runs yet. Create one from the preview above.</p>
        ) : (
          <ul className="divide-y divide-tc-100">
            {runs.map((run) => (
              <li key={run.id}>
                <Link href={`/admin/payroll/${run.id}`} className="flex items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-tc-50">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-tc-900">{run.label}</p>
                    <p className="text-[13px] text-tc-500">
                      {fmtDay(run.periodStart)} – {fmtDay(run.periodEnd)}
                    </p>
                  </div>
                  <span className="flex items-center gap-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${run.status === 'PAID' ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200' : 'bg-tc-lime-wash text-tc-lime-ink ring-1 ring-tc-lime/50'}`}
                    >
                      {run.status === 'PAID' ? 'Paid' : 'Open'}
                    </span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-tc-300" aria-hidden="true">
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
