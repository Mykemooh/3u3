import Link from 'next/link';
import { getTenant, formatMoney } from '@/lib/data';
import { cleaningReport, rangeFor, type RangeKey } from '@/lib/reports';
import { businessTodayISO } from '@/lib/time';

export const dynamic = 'force-dynamic';

const RANGES: [RangeKey, string][] = [
  ['this_month', 'This month'],
  ['last_month', 'Last month'],
  ['last_90', 'Last 90 days'],
  ['this_year', 'This year'],
];

const mins = (m: number | null) => (m == null ? '—' : m >= 60 ? `${Math.floor(m / 60)}h ${Math.round(m % 60)}m` : `${Math.round(m)} min`);
const pretty = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="card !p-4">
      <p className="text-sm text-slate">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${tone === 'good' ? 'text-green' : tone === 'bad' ? 'text-red-600' : 'text-ink'}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

function Bar({ value, max }: { value: number; max: number }) {
  return (
    <div className="h-2 w-full rounded-full bg-surface">
      <div className="h-2 rounded-full bg-gradient-to-r from-gold to-green-light" style={{ width: `${max ? Math.max(2, (value / max) * 100) : 0}%` }} />
    </div>
  );
}

export default async function ReportsPage({ searchParams }: { searchParams: { range?: string; from?: string; to?: string } }) {
  const tenant = await getTenant();
  if (!tenant) return null;
  const today = businessTodayISO();
  const key = (['this_month', 'last_month', 'last_90', 'this_year', 'custom'].includes(searchParams.range ?? '') ? searchParams.range : 'this_month') as RangeKey;
  const { from, to } = rangeFor(key, today, { from: searchParams.from, to: searchParams.to });
  const r = await cleaningReport(tenant.id, from, to);
  const q = `from=${from}&to=${to}`;
  const roomMax = Math.max(1, ...r.work.rooms.map((x) => x.averageMinutes));
  const serviceMax = Math.max(1, ...r.work.byService.map((x) => x.cleans));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-ink">Cleaning reports</h2>
          <p className="text-slate">
            {pretty(from)} – {pretty(to)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {RANGES.map(([k, label]) => (
            <Link key={k} href={`/admin/reports?range=${k}`} className={`pill !px-3 !py-1.5 text-sm ${key === k ? 'bg-ink text-white' : 'bg-surface text-slate hover:bg-line'}`}>
              {label}
            </Link>
          ))}
          <form className="flex items-center gap-1" action="/admin/reports">
            <input type="hidden" name="range" value="custom" />
            <input type="date" name="from" defaultValue={from} max={today} className="rounded-lg border border-line px-2 py-1 text-sm" aria-label="From" />
            <span className="text-muted">–</span>
            <input type="date" name="to" defaultValue={to} max={today} className="rounded-lg border border-line px-2 py-1 text-sm" aria-label="To" />
            <button className="btn-secondary !px-3 !py-1 text-sm">Go</button>
          </form>
        </div>
      </div>

      {/* Money */}
      <section className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wide text-muted">Money</h3>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Collected" value={formatMoney(r.money.revenueCents)} hint={r.money.tipsCents ? `+ ${formatMoney(r.money.tipsCents)} in tips for the crew` : 'Invoices paid in this range'} />
          <Stat label="Labor" value={formatMoney(r.money.laborCents)} hint={r.money.missingRates.length ? `No pay rate for ${r.money.missingRates.join(', ')}` : 'What the cleans in this range cost in pay'} />
          <Stat label="Expenses" value={formatMoney(r.money.expensesCents)} hint="From Admin → Expenses" />
          <Stat label="What you kept" value={formatMoney(r.money.profitCents)} tone={r.money.profitCents >= 0 ? 'good' : 'bad'} hint="Collected − labor − expenses" />
        </div>
        <p className="text-sm text-slate">
          Invoiced in this range: <strong>{formatMoney(r.money.billedCents)}</strong> · Waiting to be paid now:{' '}
          <Link href="/admin/invoices" className="font-semibold text-gold hover:underline">
            {formatMoney(r.money.outstandingCents)} across {r.money.outstandingCount} invoice{r.money.outstandingCount === 1 ? '' : 's'}
          </Link>
        </p>
      </section>

      {/* Work */}
      <section className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wide text-muted">The work</h3>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Cleans finished" value={String(r.work.cleans)} hint={r.work.cancelled ? `${r.work.cancelled} cancelled` : undefined} />
          <Stat label="Average clean" value={mins(r.work.averageMinutes)} hint="Clock start to finish" />
          <Stat label="Average price" value={r.work.averageTicketCents != null ? formatMoney(r.work.averageTicketCents) : '—'} />
          <Stat label="Rooms timed" value={String(r.work.rooms.reduce((s, x) => s + x.rooms, 0))} hint="From the crew’s room timers" />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card">
            <div className="mb-3 flex items-center justify-between">
              <p className="font-semibold">Time per room</p>
              <a href={`/api/admin/export?kind=room-times&${q}`} className="text-sm font-semibold text-gold hover:underline">CSV</a>
            </div>
            {r.work.rooms.length === 0 ? (
              <p className="text-sm text-muted">No timed rooms yet. Times appear once crews open each room in the app.</p>
            ) : (
              <div className="space-y-2.5">
                {r.work.rooms.map((x) => (
                  <div key={x.room}>
                    <div className="flex justify-between text-sm">
                      <span>
                        {x.room} <span className="text-muted">· {x.rooms}</span>
                      </span>
                      <span className="font-semibold">{mins(x.averageMinutes)}</span>
                    </div>
                    <Bar value={x.averageMinutes} max={roomMax} />
                    <p className="mt-0.5 text-xs text-muted">
                      Typical {mins(x.medianMinutes)} · fastest {mins(x.fastestMinutes)} · slowest {mins(x.slowestMinutes)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="card">
            <div className="mb-3 flex items-center justify-between">
              <p className="font-semibold">By service</p>
              <a href={`/api/admin/export?kind=cleans&${q}`} className="text-sm font-semibold text-gold hover:underline">CSV</a>
            </div>
            {r.work.byService.length === 0 ? (
              <p className="text-sm text-muted">No finished cleans in this range.</p>
            ) : (
              <div className="space-y-2.5">
                {r.work.byService.map((x) => (
                  <div key={x.service}>
                    <div className="flex justify-between text-sm">
                      <span>{x.service}</span>
                      <span className="font-semibold">
                        {x.cleans} · {mins(x.averageMinutes)} avg
                      </span>
                    </div>
                    <Bar value={x.cleans} max={serviceMax} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Team */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wide text-muted">Team</h3>
          <a href={`/api/admin/export?kind=payroll&${q}`} className="text-sm font-semibold text-gold hover:underline">CSV</a>
        </div>
        <div className="overflow-hidden rounded-2xl border border-line bg-white">
          {r.team.length === 0 && <p className="p-5 text-sm text-muted">No finished cleans in this range.</p>}
          {r.team.map((m) => (
            <div key={m.name} className="flex items-center gap-3 border-b border-line/60 px-4 py-3 text-sm last:border-0">
              <span className="flex-1 font-semibold">{m.name}</span>
              <span className="w-20 text-right">{m.cleans} clean{m.cleans === 1 ? '' : 's'}</span>
              <span className="w-20 text-right">{m.hours.toFixed(1)} h</span>
              <span className="w-24 text-right font-semibold">{m.payCents == null ? 'No rate' : formatMoney(m.payCents)}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Quality and pipeline */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card space-y-3">
          <p className="font-semibold">Quality</p>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-2xl font-bold">{r.quality.averageRating ?? '—'}</p>
              <p className="text-xs text-muted">average stars</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{r.quality.reviews}</p>
              <p className="text-xs text-muted">reviews</p>
            </div>
            <div>
              <p className={`text-2xl font-bold ${r.quality.openRecleans ? 'text-red-600' : ''}`}>{r.quality.openRecleans}</p>
              <p className="text-xs text-muted">open re-cleans</p>
            </div>
          </div>
          {r.quality.rooms.length > 0 && (
            <p className="text-sm text-slate">
              Lowest-rated rooms (all time): {r.quality.rooms.slice(0, 3).map((x) => `${x.room} ${x.average}★`).join(' · ')}
            </p>
          )}
          <Link href="/admin/reviews" className="text-sm font-semibold text-gold hover:underline">See reviews →</Link>
        </div>
        <div className="card space-y-3">
          <p className="font-semibold">New business</p>
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div><p className="text-2xl font-bold">{r.pipeline.newClients}</p><p className="text-xs text-muted">new leads</p></div>
            <div><p className="text-2xl font-bold">{r.pipeline.walkthroughs}</p><p className="text-xs text-muted">walkthroughs</p></div>
            <div><p className="text-2xl font-bold">{r.pipeline.quotesSent}</p><p className="text-xs text-muted">quotes sent</p></div>
            <div><p className="text-2xl font-bold">{r.pipeline.winRate == null ? '—' : `${r.pipeline.winRate}%`}</p><p className="text-xs text-muted">quotes won</p></div>
          </div>
          <p className="text-sm text-slate">
            {r.pipeline.quotesApproved} approved, worth {formatMoney(r.pipeline.approvedValueCents)} per visit.
          </p>
          <Link href="/admin/pipeline" className="text-sm font-semibold text-gold hover:underline">Open the pipeline →</Link>
        </div>
      </section>

      <section className="card">
        <p className="mb-2 font-semibold">Download for your accountant</p>
        <div className="flex flex-wrap gap-2 text-sm">
          {[
            ['invoices', 'Invoices'],
            ['cleans', 'Cleans'],
            ['payroll', 'Pay by person'],
            ['expenses', 'Expenses'],
            ['room-times', 'Room times'],
            ['clients', 'Client list'],
          ].map(([k, label]) => (
            <a key={k} href={`/api/admin/export?kind=${k}&${q}`} className="btn-secondary !px-3 !py-1.5">
              {label} (CSV)
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
