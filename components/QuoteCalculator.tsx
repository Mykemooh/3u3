'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { pricedMethods, quoteFromConfig, type ClutterLevel, type Frequency, type QuoteLine, type QuotingConfig } from '@/lib/quoting';

const money = (c: number) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (v: string) => Math.max(0, parseFloat(v.replace(/[^\d.]/g, '')) || 0);
const METHOD_LABEL = { ROOMS: 'Bedrooms and bathrooms', SQFT: 'Square footage', HOURLY: 'By the hour' } as const;

/**
 * Works a home clean's price out from the company's quoting settings
 * (Settings → Quoting) inside the estimate editor. Only the methods and
 * adjustments the company switched on appear. "Use these lines" fills the
 * estimate; every line stays editable.
 */
export default function QuoteCalculator({
  config,
  serviceName,
  isDeep,
  home,
  onApply,
}: {
  config: QuotingConfig;
  serviceName: string;
  isDeep: boolean;
  home: { bedrooms: number | null; bathrooms: number | null } | null;
  onApply: (lines: QuoteLine[]) => void;
}) {
  const methods = pricedMethods(config);
  const [method, setMethod] = useState(methods[0]);
  const [beds, setBeds] = useState(String(home?.bedrooms ?? 3));
  const [baths, setBaths] = useState(String(home?.bathrooms ?? 2));
  const [sqft, setSqft] = useState('');
  const [hours, setHours] = useState(String(config.hourly.minimumHours || 2));
  const [cleaners, setCleaners] = useState('2');
  const [clutter, setClutter] = useState<ClutterLevel>('AVERAGE');
  const [pets, setPets] = useState('0');
  const [frequency, setFrequency] = useState<Frequency>('ONE_TIME');

  const result = useMemo(() => {
    if (!method) return null;
    if (method === 'SQFT' && !(num(sqft) > 0)) return null;
    return quoteFromConfig(
      config,
      {
        method,
        bedrooms: num(beds),
        bathrooms: num(baths),
        squareFeet: num(sqft),
        hours: num(hours),
        cleaners: num(cleaners) || 1,
        clutter: config.clutter.on ? clutter : undefined,
        pets: config.pets.on ? num(pets) : 0,
        frequency: config.frequency.on ? frequency : undefined,
        deep: isDeep,
      },
      serviceName,
    );
  }, [config, method, beds, baths, sqft, hours, cleaners, clutter, pets, frequency, isDeep, serviceName]);

  if (!methods.length || !method) {
    return (
      <p className="rounded-xl bg-surface px-4 py-3 text-sm text-slate">
        You price these after a walkthrough, so type the lines below.{' '}
        <Link href="/admin/settings/quoting" className="font-semibold text-ink underline">
          Quoting settings
        </Link>
      </p>
    );
  }

  const input = (id: string, label: string, value: string, set: (v: string) => void, step = '1') => (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <input id={id} className="input w-full" type="number" min="0" step={step} inputMode="decimal" value={value} onChange={(e) => set(e.target.value)} />
    </div>
  );

  return (
    <div className="rounded-2xl border border-line bg-surface/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-ink">Work out the price</p>
        <Link href="/admin/settings/quoting" className="text-xs font-semibold text-muted hover:text-ink">
          Quoting settings
        </Link>
      </div>

      {methods.length > 1 && (
        <div role="radiogroup" aria-label="How to price this clean" className="mt-3 inline-flex flex-wrap gap-1 rounded-xl border border-line bg-white p-1">
          {methods.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={method === m}
              onClick={() => setMethod(m)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${method === m ? 'bg-ink text-white' : 'text-slate hover:text-ink'}`}
            >
              {METHOD_LABEL[m]}
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {method === 'ROOMS' && (
          <>
            {input('qc-beds', 'Bedrooms', beds, setBeds)}
            {input('qc-baths', 'Bathrooms', baths, setBaths, '0.5')}
          </>
        )}
        {method === 'SQFT' && input('qc-sqft', 'Square feet', sqft, setSqft, '50')}
        {method === 'HOURLY' && (
          <>
            {input('qc-hours', 'Hours', hours, setHours, '0.25')}
            {input('qc-cleaners', 'Cleaners', cleaners, setCleaners)}
          </>
        )}
        {config.clutter.on && (
          <div>
            <label className="label" htmlFor="qc-clutter">
              Clutter
            </label>
            <select id="qc-clutter" className="input w-full" value={clutter} onChange={(e) => setClutter(e.target.value as ClutterLevel)}>
              <option value="LIGHT">Light</option>
              <option value="AVERAGE">Average</option>
              <option value="HEAVY">Heavy</option>
            </select>
          </div>
        )}
        {config.pets.on && input('qc-pets', 'Pets', pets, setPets)}
        {config.frequency.on && (
          <div>
            <label className="label" htmlFor="qc-freq">
              How often
            </label>
            <select id="qc-freq" className="input w-full" value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}>
              <option value="ONE_TIME">One time</option>
              <option value="WEEKLY">Weekly</option>
              <option value="BIWEEKLY">Every two weeks</option>
              <option value="MONTHLY">Monthly</option>
            </select>
          </div>
        )}
      </div>
      {isDeep && config.deep.on && <p className="mt-2 text-xs text-slate">Deep clean: +{config.deep.extraPct}% added for this service.</p>}

      {result ? (
        <div className="mt-4 rounded-xl border border-line bg-white p-3">
          <ul className="space-y-1 text-sm">
            {result.lines.map((l, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span className="text-slate">{l.description}</span>
                <span className="tabular-nums text-ink">{money(l.amountCents)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex items-center justify-between border-t border-line pt-2">
            <span className="font-semibold text-ink">{money(result.totalCents)}</span>
            <button type="button" className="btn-secondary btn-sm" onClick={() => onApply(result.lines)}>
              Use these lines
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted">Enter the home's square footage to see the price.</p>
      )}
    </div>
  );
}
