import Link from 'next/link';
import { getTenant, formatMoney } from '@/lib/data';
import { listExpenses, expenseSummary, monthlyTotals, EXPENSE_CATEGORIES } from '@/lib/expenses';
import { businessTodayISO } from '@/lib/time';
import { db } from '@/db/client';
import { crews, jobs, bookings, users } from '@/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import ExpensesManager from '@/components/admin/ExpensesManager';

export const dynamic = 'force-dynamic';

const monthName = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const shift = (m: string, by: number) => {
  const [y, mo] = m.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1 + by, 1)).toISOString().slice(0, 7);
};

export default async function ExpensesPage({ searchParams }: { searchParams: { month?: string; new?: string } }) {
  const tenant = await getTenant();
  if (!tenant) return null;
  const today = businessTodayISO();
  const month = /^\d{4}-\d{2}$/.test(searchParams.month ?? '') ? searchParams.month! : today.slice(0, 7);
  const from = `${month}-01`;
  const to = `${month}-31`;
  const [rows, summary, trend, crewRows] = await Promise.all([
    listExpenses(tenant.id, from, to),
    expenseSummary(tenant.id, from, to),
    monthlyTotals(tenant.id, month, 6),
    db.select().from(crews).where(eq(crews.tenantId, tenant.id)),
  ]);
  // Tolls the crew app adds (lib/trips.ts) carry their job: name the client it was for.
  const jobIds = Array.from(new Set(rows.map((r) => r.jobId).filter((j): j is string => !!j)));
  const jobRows = jobIds.length
    ? await db
        .select({ id: jobs.id, client: users.name })
        .from(jobs)
        .innerJoin(bookings, eq(bookings.id, jobs.bookingId))
        .innerJoin(users, eq(users.id, bookings.clientId))
        .where(and(inArray(jobs.id, jobIds), eq(bookings.tenantId, tenant.id)))
    : [];
  const jobLabel = new Map(jobRows.map((j) => [j.id, j.client]));
  const peak = Math.max(1, ...trend.map((t) => t.cents));
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold text-ink">Expenses</h2>
          <p className="max-w-2xl text-slate">What the business spends, so Reports can show what you actually made.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/admin/expenses?month=${shift(month, -1)}`} className="btn-secondary !px-3 !py-1.5 text-sm" aria-label="Previous month">←</Link>
          <span className="min-w-[9rem] text-center font-semibold">{monthName(month)}</span>
          {month < today.slice(0, 7) ? (
            <Link href={`/admin/expenses?month=${shift(month, 1)}`} className="btn-secondary !px-3 !py-1.5 text-sm" aria-label="Next month">→</Link>
          ) : (
            <span className="w-[42px]" />
          )}
        </div>
      </div>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="card">
          <p className="text-sm text-slate">Spent in {monthName(month).split(' ')[0]}</p>
          <p className="mt-1 text-3xl font-bold">{formatMoney(summary.totalCents)}</p>
          <p className="text-xs text-muted">{summary.count} expense{summary.count === 1 ? '' : 's'}</p>
          <div className="mt-4 flex h-20 items-end gap-2" aria-label="Last six months">
            {trend.map((t) => (
              <div key={t.month} className="flex flex-1 flex-col items-center gap-1">
                <div className={`w-full rounded-t ${t.month === month ? 'bg-gold' : 'bg-gold/25'}`} style={{ height: `${Math.max(3, (t.cents / peak) * 64)}px` }} title={`${monthName(t.month)}: ${formatMoney(t.cents)}`} />
                <span className="text-[10px] text-muted">{monthName(t.month).slice(0, 3)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card lg:col-span-2">
          <p className="mb-3 text-sm font-semibold text-slate">By category</p>
          {summary.byCategory.length === 0 && <p className="text-sm text-muted">Nothing yet this month.</p>}
          <div className="space-y-2">
            {summary.byCategory.map((c) => (
              <div key={c.category}>
                <div className="flex justify-between text-sm">
                  <span>{c.category}</span>
                  <span className="font-semibold">{formatMoney(c.cents)}</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-surface">
                  <div className="h-2 rounded-full bg-ink" style={{ width: `${(c.cents / Math.max(1, summary.totalCents)) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <ExpensesManager
        expenses={rows.map((r) => ({
          id: r.id, spentOn: r.spentOn, category: r.category, vendor: r.vendor, amountCents: r.amountCents, notes: r.notes, crewId: r.crewId,
          job: r.jobId && jobLabel.has(r.jobId) ? { id: r.jobId, client: jobLabel.get(r.jobId)! } : null,
        }))}
        categories={EXPENSE_CATEGORIES}
        crews={crewRows.map((c) => ({ id: c.id, name: c.name }))}
        today={today}
        startOpen={searchParams.new === '1'}
      />
      <p className="text-sm text-slate">
        Need all of it in a spreadsheet? <a className="font-semibold text-gold hover:underline" href={`/api/admin/export?kind=expenses&from=${from}&to=${to}`}>Download this month as CSV</a>
      </p>
    </div>
  );
}
