'use client';

import { useMemo, useState } from 'react';
import { POST_CON_PHASES, FACILITY_TYPES, type Intake } from '@/lib/intake';
import { POST_CON_RATE_GUIDE, productionGuideFor, postConstructionPrice, commercialPrice, type QuotePricing } from '@/lib/pricingGuides';

type Item = { description: string; amountCents: number };
const money = (c: number) => `$${(c / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const n = (s: string) => Number(String(s).replace(/[^\d.]/g, ''));

/**
 * The owner's pricing calculator inside the quote editor, for the two
 * lines that aren't priced per home. The guide ranges show here only;
 * the client sees the finished line items.
 */
export default function PricingHelper({
  kind,
  intake,
  initial,
  onApply,
}: {
  kind: 'POST_CONSTRUCTION' | 'COMMERCIAL';
  intake: Intake | null;
  initial: QuotePricing | null;
  onApply: (items: Item[], pricing: QuotePricing) => void;
}) {
  const pcIntake = intake?.kind === 'POST_CONSTRUCTION' ? intake : null;
  const cmIntake = intake?.kind === 'COMMERCIAL' ? intake : null;
  const pcInit = initial?.kind === 'POST_CONSTRUCTION' ? initial : null;
  const cmInit = initial?.kind === 'COMMERCIAL' ? initial : null;

  const [sqft, setSqft] = useState(String(pcInit?.squareFeet ?? cmInit?.squareFeet ?? intake?.squareFeet ?? ''));
  // Post-construction
  const [phaseOn, setPhaseOn] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(POST_CON_PHASES.map((p) => [p.key, pcInit ? pcInit.phases.some((x) => x.key === p.key) : pcIntake ? pcIntake.phases.includes(p.key) : p.key === 'FINAL'])),
  );
  const [rates, setRates] = useState<Record<string, string>>(() =>
    Object.fromEntries(POST_CON_PHASES.map((p) => [p.key, String(pcInit?.phases.find((x) => x.key === p.key)?.ratePerSqFt ?? POST_CON_RATE_GUIDE[p.key].suggested)])),
  );
  // Commercial
  const facility = cmIntake?.facilityType;
  const guide = productionGuideFor(facility);
  const [production, setProduction] = useState(String(cmInit?.productionRate ?? guide.suggested));
  const [visits, setVisits] = useState(String(cmInit?.visitsPerWeek ?? cmIntake?.visitsPerWeek ?? 1));
  const [hourly, setHourly] = useState(cmInit ? String(cmInit.hourlyRateCents / 100) : '');
  const [supplies, setSupplies] = useState(cmInit ? String(cmInit.suppliesMonthlyCents / 100) : cmIntake?.suppliesBy === 'US' ? '' : '0');

  const post = useMemo(() => {
    const sq = n(sqft);
    if (!(sq > 0)) return null;
    const phases = POST_CON_PHASES.filter((p) => phaseOn[p.key]).map((p) => ({ key: p.key, label: p.label, ratePerSqFt: n(rates[p.key]) || 0 }));
    if (!phases.length) return null;
    return postConstructionPrice({ squareFeet: Math.round(sq), phases });
  }, [sqft, phaseOn, rates]);

  const comm = useMemo(() => {
    const sq = n(sqft);
    const pr = n(production);
    const hr = n(hourly);
    if (!(sq > 0) || !(pr > 0) || !(hr > 0)) return null;
    return commercialPrice({ squareFeet: Math.round(sq), productionRate: pr, visitsPerWeek: Number(visits), hourlyRateCents: Math.round(hr * 100), suppliesMonthlyCents: Math.round((n(supplies) || 0) * 100) });
  }, [sqft, production, visits, hourly, supplies]);

  function apply() {
    if (kind === 'POST_CONSTRUCTION' && post) {
      onApply(
        post.phases.map((p) => ({ description: `${p.label} — ${post.squareFeet.toLocaleString()} sq ft`, amountCents: p.amountCents })),
        { kind: 'POST_CONSTRUCTION', squareFeet: post.squareFeet, phases: post.phases },
      );
    }
    if (kind === 'COMMERCIAL' && comm) {
      const v = Number(visits);
      const hrs = `${comm.hoursPerVisit} hour${comm.hoursPerVisit === 1 ? '' : 's'}`;
      const items: Item[] =
        v === 0
          ? [{ description: `Commercial cleaning — one visit, about ${hrs}`, amountCents: comm.perVisitCents }]
          : [
              { description: `Commercial cleaning — ${v} visit${v === 1 ? '' : 's'} a week, about ${hrs} each (per month)`, amountCents: comm.laborMonthlyCents },
              ...(comm.suppliesMonthlyCents > 0 ? [{ description: 'Restroom paper, soap and liners (per month)', amountCents: comm.suppliesMonthlyCents }] : []),
            ];
      onApply(items, {
        kind: 'COMMERCIAL',
        squareFeet: Math.round(n(sqft)),
        productionRate: n(production),
        visitsPerWeek: v,
        hourlyRateCents: Math.round(n(hourly) * 100),
        hoursPerVisit: comm.hoursPerVisit,
        suppliesMonthlyCents: comm.suppliesMonthlyCents,
        monthlyCents: comm.monthlyCents,
        perVisitCents: comm.perVisitCents,
      });
    }
  }

  return (
    <div className="rounded-2xl border border-gold/30 bg-gold/5 p-4">
      <p className="text-sm font-bold text-ink">{kind === 'POST_CONSTRUCTION' ? 'Price by phase' : 'Monthly price calculator'}</p>
      <p className="mb-3 text-xs text-slate">Only you see this. Fill it in from the walkthrough, then use the result as the quote’s lines.</p>
      <label className="mb-3 block max-w-[12rem]">
        <span className="label">Square feet</span>
        <input className="input !py-2" inputMode="numeric" value={sqft} onChange={(e) => setSqft(e.target.value)} />
      </label>

      {kind === 'POST_CONSTRUCTION' ? (
        <div className="space-y-2">
          {POST_CON_PHASES.map((p) => {
            const g = POST_CON_RATE_GUIDE[p.key];
            const line = post?.phases.find((x) => x.key === p.key);
            return (
              <div key={p.key} className="flex flex-wrap items-center gap-3 rounded-xl bg-white p-3">
                <label className="flex min-w-[9rem] items-center gap-2 font-semibold">
                  <input type="checkbox" checked={!!phaseOn[p.key]} onChange={(e) => setPhaseOn({ ...phaseOn, [p.key]: e.target.checked })} />
                  {p.label}
                </label>
                <label className="flex items-center gap-1 text-sm">
                  $<input className="w-20 rounded-lg border border-line px-2 py-1" inputMode="decimal" value={rates[p.key]} onChange={(e) => setRates({ ...rates, [p.key]: e.target.value })} disabled={!phaseOn[p.key]} />
                  / sq ft
                </label>
                <span className="text-xs text-muted">Typical ${g.low.toFixed(2)}–${g.high.toFixed(2)}</span>
                <span className="ml-auto font-semibold">{line ? money(line.amountCents) : '—'}</span>
              </div>
            );
          })}
          <p className="text-right text-sm font-bold">Project total {post ? money(post.totalCents) : '—'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              <span className="label">Sq ft one cleaner does an hour</span>
              <input className="input !py-2" inputMode="numeric" value={production} onChange={(e) => setProduction(e.target.value)} />
              <span className="mt-1 block text-xs text-muted">
                {guide.guided
                  ? `${FACILITY_TYPES.find((f) => f[0] === facility)?.[1] ?? 'Office'}: typically ${guide.low.toLocaleString()}–${guide.high.toLocaleString()}`
                  : 'No published range for this kind of space — starts from the office figure; adjust after the walkthrough.'}
              </span>
            </label>
            <label>
              <span className="label">Visits a week</span>
              <select className="input !py-2" value={visits} onChange={(e) => setVisits(e.target.value)}>
                <option value="0">One-time</option>
                {[1, 2, 3, 4, 5, 6, 7].map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="label">Your hourly rate ($)</span>
              <input className="input !py-2" inputMode="decimal" placeholder="Per cleaner-hour" value={hourly} onChange={(e) => setHourly(e.target.value)} />
            </label>
            <label>
              <span className="label">Supplies you provide ($ a month)</span>
              <input className="input !py-2" inputMode="decimal" value={supplies} onChange={(e) => setSupplies(e.target.value)} />
            </label>
          </div>
          {comm ? (
            <div className="rounded-xl bg-white p-3 text-sm">
              <p>
                About <strong>{comm.hoursPerVisit} cleaner-hours</strong> a visit
                {Number(visits) > 0 ? ` × ${visits} a week × 52 ÷ 12 = ${comm.visitsPerMonth} visits a month` : ''}.
              </p>
              {Number(visits) > 0 ? (
                <p className="mt-1">
                  Labor {money(comm.laborMonthlyCents)} + supplies {money(comm.suppliesMonthlyCents)} = <strong>{money(comm.monthlyCents)} a month</strong> ({money(comm.perVisitCents)} a visit, billed monthly)
                </p>
              ) : (
                <p className="mt-1">
                  One visit: <strong>{money(comm.perVisitCents)}</strong>
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted">Add the square footage and your hourly rate to see the price.</p>
          )}
        </div>
      )}
      <button type="button" className="btn-primary mt-3 !px-4 !py-2 text-sm" disabled={kind === 'POST_CONSTRUCTION' ? !post : !comm} onClick={apply}>
        Use these as the quote lines
      </button>
    </div>
  );
}
