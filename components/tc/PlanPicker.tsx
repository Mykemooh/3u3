'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import { PLANS, PLAN_ORDER, feeLabel, dollars, bestPlanFor, type PlanKey } from '@/lib/billing/plans';

const PRESETS = [0, 5000, 10000, 20000, 40000];

/**
 * Plan cards that answer "which one is cheapest for me?" as you drag:
 * each card shows what it would cost at that month's card volume, and the
 * cheapest is marked. Prices and fees come from lib/billing/plans.ts.
 */
export default function PlanPicker({ ctaHref = '/start', initialVolume = 10000 }: { ctaHref?: string; initialVolume?: number }) {
  const [volume, setVolume] = useState(initialVolume);
  const id = useId();
  const { plan: best, costs } = bestPlanFor(volume * 100);

  return (
    <div>
      <div className="rounded-tc-lg border border-tc-200 bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <label htmlFor={id} className="text-[15px] font-semibold text-tc-900">
            Card payments your clients make each month
          </label>
          <output htmlFor={id} className="font-tc-display text-[28px] font-extrabold tabular-nums tracking-[-0.02em]">
            {dollars(volume * 100)}
          </output>
        </div>
        <input
          id={id}
          type="range"
          min={0}
          max={50000}
          step={500}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          className="tc-range mt-4 w-full"
          aria-valuetext={`${dollars(volume * 100)} a month`}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setVolume(p)}
              aria-pressed={volume === p}
              className={`min-h-[36px] rounded-lg px-3 text-[13px] font-semibold transition-colors ${
                volume === p ? 'bg-tc-black text-white' : 'bg-tc-100 text-tc-700 hover:bg-tc-200'
              }`}
            >
              {p === 0 ? 'Cash only' : dollars(p * 100)}
            </button>
          ))}
        </div>
        <p className="mt-3 text-[13px] text-tc-500">Cash, check and Zelle never count. Stripe’s own card processing fee applies on every plan, the same as any software.</p>
      </div>

      <ul className="mt-6 grid gap-4 lg:grid-cols-3">
        {PLAN_ORDER.map((k: PlanKey) => {
          const p = PLANS[k];
          const isBest = best.key === k;
          return (
            <li
              key={k}
              className={`relative flex flex-col rounded-tc-lg p-6 transition-[box-shadow,border-color] duration-200 ${
                isBest ? 'border-2 border-tc-black bg-white shadow-tc-lg' : 'border border-tc-200 bg-white'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-[18px] font-bold">{p.name}</h3>
                {isBest && (
                  <span className="rounded-md bg-tc-lime px-2 py-0.5 text-[12px] font-bold text-tc-black">Cheapest for you</span>
                )}
              </div>
              <p className="mt-2 min-h-[48px] text-[14px] leading-relaxed text-tc-700">{p.tagline}</p>
              <p className="mt-5 flex items-baseline gap-1">
                <span className="font-tc-display text-[44px] font-extrabold leading-none tracking-[-0.035em]">{dollars(p.monthlyCents)}</span>
                <span className="text-[15px] font-semibold text-tc-500">/ month</span>
              </p>
              <p className="mt-1 text-[14px] font-semibold text-tc-900">+ {feeLabel(p).replace('No platform fee', 'no platform fee')}</p>

              <div className="mt-5 rounded-xl bg-tc-50 px-4 py-3">
                <p className="text-[12px] font-semibold text-tc-500">At {dollars(volume * 100)} in card payments</p>
                <p className="mt-0.5 font-tc-display text-[22px] font-extrabold tabular-nums">
                  {dollars(costs[k])}
                  <span className="text-[13px] font-semibold text-tc-500"> a month</span>
                </p>
              </div>

              <dl className="mt-5 space-y-2.5 text-[14px]">
                <div className="flex justify-between gap-4">
                  <dt className="text-tc-500">Texts included</dt>
                  <dd className="font-semibold">{p.includedTexts ? `${p.includedTexts.toLocaleString()} / mo` : 'Pay as you go'}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-tc-500">Tex phone minutes</dt>
                  <dd className="font-semibold">{p.includedVoiceMinutes ? `${p.includedVoiceMinutes} / mo` : 'Pay as you go'}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-tc-500">Users</dt>
                  <dd className="font-semibold">Unlimited</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-tc-500">Onboarding</dt>
                  <dd className="text-right font-semibold">{p.onboarding}</dd>
                </div>
              </dl>

              <Link href={`${ctaHref}?plan=${k.toLowerCase()}`} className={`mt-6 w-full ${isBest ? 'tc-btn-dark' : 'tc-btn-ghost'}`}>
                {p.monthlyCents === 0 ? 'Start free' : `Start on ${p.name}`}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
