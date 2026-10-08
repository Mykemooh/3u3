'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

export type PreviewRow = {
  employeeId: string;
  name: string;
  payTypeLabel: string;
  hasRate: boolean;
  hours: number;
  jobCount: number;
  daysWorked: number;
  payCents: number | null;
  tipCents: number;
};

const money = (cents: number) => (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const initials = (name: string) =>
  name
    .replace(/\(.*?\)/g, '')
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

/**
 * The pay-period preview with a name search. Filtering is only a view: the
 * payroll run always includes everyone with a rate, whatever is typed here.
 */
export default function PayrollPreviewTable({ rows, action }: { rows: PreviewRow[]; action?: React.ReactNode }) {
  const [q, setQ] = useState('');
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? rows.filter((r) => r.name.toLowerCase().includes(needle)) : rows;
  }, [rows, q]);
  const total = shown.reduce((s, r) => s + (r.payCents ?? 0) + r.tipCents, 0);

  return (
    <section className="overflow-hidden rounded-2xl border border-tc-200 bg-white shadow-tc-ring" aria-labelledby="preview-h">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-tc-200 px-5 py-4">
        <div>
          <h2 id="preview-h" className="text-[16px] font-semibold text-tc-900">
            Pay preview
          </h2>
          <p className="text-[13px] text-tc-500">
            {rows.length} {rows.length === 1 ? 'person' : 'people'} with completed, unpaid work in this period
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative block">
            <span className="sr-only">Search by name</span>
            <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-tc-500" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name"
              className="h-10 w-60 rounded-lg border border-tc-200 bg-tc-50 pl-9 pr-3 text-sm text-tc-900 placeholder:text-tc-500 focus:border-tc-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-tc-lime/60"
            />
          </label>
          {action}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="bg-tc-50 text-[11px] uppercase tracking-[0.08em] text-tc-500">
              <th className="px-5 py-2.5 font-semibold">Cleaner</th>
              <th className="px-3 py-2.5 font-semibold">Pay type</th>
              <th className="px-3 py-2.5 text-right font-semibold">Hours</th>
              <th className="px-3 py-2.5 text-right font-semibold">Jobs</th>
              <th className="px-3 py-2.5 text-right font-semibold">Days</th>
              <th className="px-3 py-2.5 text-right font-semibold">Pay</th>
              <th className="px-3 py-2.5 text-right font-semibold">Tips</th>
              <th className="px-5 py-2.5 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-tc-100">
            {shown.map((r) => (
              <tr key={r.employeeId} className="transition-colors hover:bg-tc-50/70">
                <td className="px-5 py-3">
                  <span className="flex items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-tc-black text-[11px] font-bold text-tc-lime">{initials(r.name) || '·'}</span>
                    <span className="font-semibold text-tc-900">{r.name}</span>
                  </span>
                </td>
                <td className="px-3 py-3">
                  <span className="rounded-full bg-tc-100 px-2.5 py-1 text-[12px] font-medium text-tc-700">{r.payTypeLabel}</span>
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-tc-700">{r.hours.toFixed(2)}</td>
                <td className="px-3 py-3 text-right tabular-nums text-tc-700">{r.jobCount}</td>
                <td className="px-3 py-3 text-right tabular-nums text-tc-700">{r.daysWorked}</td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {r.hasRate && r.payCents != null ? (
                    <span className="text-tc-900">{money(r.payCents)}</span>
                  ) : (
                    <Link href={`/admin/team/${r.employeeId}`} className="rounded-full bg-amber-50 px-2.5 py-1 text-[12px] font-semibold text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100">
                      Set a rate
                    </Link>
                  )}
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-tc-700">{r.tipCents > 0 ? money(r.tipCents) : '—'}</td>
                <td className="px-5 py-3 text-right font-semibold tabular-nums text-tc-900">{money((r.payCents ?? 0) + r.tipCents)}</td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-10 text-center text-tc-500">
                  {rows.length === 0 ? 'No completed, unpaid jobs in this period.' : `Nobody matches “${q}”.`}
                </td>
              </tr>
            )}
          </tbody>
          {shown.length > 0 && (
            <tfoot>
              <tr className="border-t border-tc-200 bg-tc-50">
                <td colSpan={7} className="px-5 py-3 text-right text-[13px] font-semibold text-tc-700">
                  {q.trim() ? `Total for ${shown.length} shown` : 'Total'}
                </td>
                <td className="px-5 py-3 text-right font-tc-display text-[18px] font-extrabold tabular-nums text-tc-900">{money(total)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}
