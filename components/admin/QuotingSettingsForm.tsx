'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Switch from '@/components/ui/Switch';
import { quoteFromConfig, type QuotingConfig } from '@/lib/quoting';

const dollars = (cents: number) => (cents / 100).toFixed(2).replace(/\.00$/, '');
const toCents = (v: string) => Math.max(0, Math.round((parseFloat(v.replace(/[^\d.]/g, '')) || 0) * 100));
const num = (v: string) => Math.max(0, parseFloat(v.replace(/[^\d.]/g, '')) || 0);
const money = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function Field({ label, prefix, suffix, value, onChange, step = 'any', id }: { label: string; prefix?: string; suffix?: string; value: string; onChange: (v: string) => void; step?: string; id: string }) {
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <div className="flex items-center gap-1.5">
        {prefix && <span className="text-sm text-muted">{prefix}</span>}
        <input id={id} className="input w-full" inputMode="decimal" type="number" min="0" step={step} value={value} onChange={(e) => onChange(e.target.value)} />
        {suffix && <span className="whitespace-nowrap text-sm text-muted">{suffix}</span>}
      </div>
    </div>
  );
}

/** One method: a title, what it does, its switch, and — only while on — its options. */
function Method({ title, detail, on, onToggle, example, children }: { title: string; detail: string; on: boolean; onToggle: (v: boolean) => void; example?: string | null; children?: React.ReactNode }) {
  return (
    <div className={`rounded-2xl border bg-white transition-colors ${on ? 'border-ink/25' : 'border-line'}`}>
      <div className="flex items-start justify-between gap-4 p-5">
        <div className="min-w-0">
          <h3 className="font-semibold text-ink">{title}</h3>
          <p className="mt-0.5 text-sm text-slate">{detail}</p>
        </div>
        <Switch checked={on} onChange={onToggle} label={title} />
      </div>
      {on && children && (
        <div className="border-t border-line px-5 pb-5 pt-4">
          {children}
          {example && <p className="mt-3 text-sm text-slate">For example: {example}</p>}
        </div>
      )}
    </div>
  );
}

/**
 * Settings → Quoting (lib/quoting.ts). The options a method needs come up
 * only when it's switched on; the deep-clean, post-construction and
 * commercial options only when the company offers those services.
 */
export default function QuotingSettingsForm({
  initial,
  saved,
  offers,
}: {
  initial: QuotingConfig;
  saved: boolean;
  offers: { deep: boolean; postConstruction: boolean; commercial: boolean };
}) {
  const router = useRouter();
  const [c, setC] = useState<QuotingConfig>(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function set<K extends keyof QuotingConfig>(key: K, patch: Partial<QuotingConfig[K]>) {
    setMsg(null);
    setC((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  const examples = useMemo(
    () => ({
      rooms: quoteFromConfig(c, { method: 'ROOMS', bedrooms: 3, bathrooms: 2 }, 'Clean').totalCents,
      sqft: quoteFromConfig(c, { method: 'SQFT', squareFeet: 2000 }, 'Clean').totalCents,
      hourly: quoteFromConfig(c, { method: 'HOURLY', hours: 3, cleaners: 2 }, 'Clean').totalCents,
    }),
    [c],
  );
  const noBase = !c.rooms.on && !c.sqft.on && !c.hourly.on && !c.walkthrough.on;

  async function save() {
    setBusy(true);
    setMsg(null);
    const res = await fetch('/api/admin/settings/quoting', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(c) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg({ ok: false, text: data.error ?? 'Could not save. Try again.' });
      return;
    }
    setMsg({ ok: true, text: 'Saved. New estimates use these settings.' });
    router.refresh();
  }

  return (
    <div className="space-y-8">
      {!saved && (
        <p className="rounded-xl bg-surface px-4 py-3 text-sm text-slate">
          We've switched on what fits how you said you price jobs. Change anything, then save.
        </p>
      )}

      <section aria-labelledby="q-base" className="space-y-3">
        <div>
          <h2 id="q-base" className="font-display text-lg font-bold text-ink">
            Price the clean
          </h2>
          <p className="text-sm text-slate">Turn on every way you quote. When an estimate is built, you pick one for that home.</p>
        </div>

        <Method
          title="By bedrooms and bathrooms"
          detail="A starting price, plus a set amount for each bedroom and bathroom."
          on={c.rooms.on}
          onToggle={(on) => set('rooms', { on })}
          example={`3 bedrooms, 2 bathrooms → ${money(examples.rooms)}`}
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <Field id="q-rooms-base" label="Starting price" prefix="$" value={dollars(c.rooms.baseCents)} onChange={(v) => set('rooms', { baseCents: toCents(v) })} />
            <Field id="q-rooms-bed" label="Each bedroom" prefix="$" value={dollars(c.rooms.perBedroomCents)} onChange={(v) => set('rooms', { perBedroomCents: toCents(v) })} />
            <Field id="q-rooms-bath" label="Each bathroom" prefix="$" value={dollars(c.rooms.perBathroomCents)} onChange={(v) => set('rooms', { perBathroomCents: toCents(v) })} />
          </div>
        </Method>

        <Method
          title="By square footage"
          detail="A rate per square foot of the home, never below your minimum."
          on={c.sqft.on}
          onToggle={(on) => set('sqft', { on })}
          example={`2,000 sq ft → ${money(examples.sqft)}`}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="q-sqft-rate" label="Price per square foot" prefix="$" step="0.01" value={String(c.sqft.centsPerSqFt / 100)} onChange={(v) => set('sqft', { centsPerSqFt: Math.round(num(v) * 10000) / 100 })} />
            <Field id="q-sqft-min" label="Minimum price" prefix="$" value={dollars(c.sqft.minimumCents)} onChange={(v) => set('sqft', { minimumCents: toCents(v) })} />
          </div>
        </Method>

        <Method
          title="By the hour"
          detail="An hourly rate for each cleaner, with a minimum number of hours."
          on={c.hourly.on}
          onToggle={(on) => set('hourly', { on })}
          example={`3 hours with 2 cleaners → ${money(examples.hourly)}`}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="q-hour-rate" label="Rate per cleaner, per hour" prefix="$" value={dollars(c.hourly.rateCents)} onChange={(v) => set('hourly', { rateCents: toCents(v) })} />
            <Field id="q-hour-min" label="Minimum hours" suffix="hours" step="0.5" value={String(c.hourly.minimumHours)} onChange={(v) => set('hourly', { minimumHours: num(v) })} />
          </div>
        </Method>

        <Method
          title="After a walkthrough"
          detail="You see the home first and type the price yourself. Nothing to set up."
          on={c.walkthrough.on}
          onToggle={(on) => set('walkthrough', { on })}
        />
        {noBase && <p className="text-sm font-semibold text-red-600">Turn on at least one way to price the clean.</p>}
      </section>

      <section aria-labelledby="q-adjust" className="space-y-3">
        <div>
          <h2 id="q-adjust" className="font-display text-lg font-bold text-ink">
            Adjust the price
          </h2>
          <p className="text-sm text-slate">Added on top of the base price, when they apply to a home.</p>
        </div>

        <Method title="Clutter level" detail="How lived-in the home is. Each level adds a percentage." on={c.clutter.on} onToggle={(on) => set('clutter', { on })}>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field id="q-cl-light" label="Light" prefix="+" suffix="%" value={String(c.clutter.lightPct)} onChange={(v) => set('clutter', { lightPct: num(v) })} />
            <Field id="q-cl-avg" label="Average" prefix="+" suffix="%" value={String(c.clutter.averagePct)} onChange={(v) => set('clutter', { averagePct: num(v) })} />
            <Field id="q-cl-heavy" label="Heavy" prefix="+" suffix="%" value={String(c.clutter.heavyPct)} onChange={(v) => set('clutter', { heavyPct: num(v) })} />
          </div>
        </Method>

        <Method title="Pets" detail="A set amount for each pet in the home." on={c.pets.on} onToggle={(on) => set('pets', { on })}>
          <div className="max-w-xs">
            <Field id="q-pets" label="Each pet" prefix="$" value={dollars(c.pets.perPetCents)} onChange={(v) => set('pets', { perPetCents: toCents(v) })} />
          </div>
        </Method>

        <Method title="Repeat-visit discount" detail="A percentage off for clients on a regular schedule." on={c.frequency.on} onToggle={(on) => set('frequency', { on })}>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field id="q-fr-w" label="Weekly" suffix="% off" value={String(c.frequency.weeklyPct)} onChange={(v) => set('frequency', { weeklyPct: num(v) })} />
            <Field id="q-fr-b" label="Every two weeks" suffix="% off" value={String(c.frequency.biweeklyPct)} onChange={(v) => set('frequency', { biweeklyPct: num(v) })} />
            <Field id="q-fr-m" label="Monthly" suffix="% off" value={String(c.frequency.monthlyPct)} onChange={(v) => set('frequency', { monthlyPct: num(v) })} />
          </div>
        </Method>

        {offers.deep && (
          <Method title="Deep and move-out cleans" detail="A percentage more when the service is a deep or move-in/out clean." on={c.deep.on} onToggle={(on) => set('deep', { on })}>
            <div className="max-w-xs">
              <Field id="q-deep" label="Extra" prefix="+" suffix="%" value={String(c.deep.extraPct)} onChange={(v) => set('deep', { extraPct: num(v) })} />
            </div>
          </Method>
        )}
      </section>

      {(offers.postConstruction || offers.commercial) && (
        <section aria-labelledby="q-special" className="space-y-3">
          <div>
            <h2 id="q-special" className="font-display text-lg font-bold text-ink">
              Your other services
            </h2>
            <p className="text-sm text-slate">The numbers their quote calculators start from. You can still change them on each estimate.</p>
          </div>
          {offers.postConstruction && (
            <div className="rounded-2xl border border-line bg-white p-5">
              <h3 className="font-semibold text-ink">Post-construction, per square foot</h3>
              <div className="mt-3 grid gap-4 sm:grid-cols-3">
                <Field id="q-pc-rough" label="Rough clean" prefix="$" step="0.01" value={String(c.postConstruction.roughPerSqFt)} onChange={(v) => set('postConstruction', { roughPerSqFt: num(v) })} />
                <Field id="q-pc-final" label="Final clean" prefix="$" step="0.01" value={String(c.postConstruction.finalPerSqFt)} onChange={(v) => set('postConstruction', { finalPerSqFt: num(v) })} />
                <Field id="q-pc-touch" label="Touch-up" prefix="$" step="0.01" value={String(c.postConstruction.touchUpPerSqFt)} onChange={(v) => set('postConstruction', { touchUpPerSqFt: num(v) })} />
              </div>
            </div>
          )}
          {offers.commercial && (
            <div className="rounded-2xl border border-line bg-white p-5">
              <h3 className="font-semibold text-ink">Commercial</h3>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <Field id="q-cm-rate" label="Square feet one cleaner covers per hour" suffix="sq ft" step="100" value={String(c.commercial.sqFtPerHour)} onChange={(v) => set('commercial', { sqFtPerHour: Math.round(num(v)) })} />
                <Field id="q-cm-hour" label="Hourly rate" prefix="$" value={dollars(c.commercial.hourlyRateCents)} onChange={(v) => set('commercial', { hourlyRateCents: toCents(v) })} />
              </div>
            </div>
          )}
        </section>
      )}

      <div className="sticky bottom-20 z-10 flex items-center gap-4 rounded-2xl border border-line bg-white/95 p-4 shadow-card backdrop-blur md:bottom-4">
        <button type="button" className="btn-primary" onClick={save} disabled={busy || noBase}>
          {busy ? 'Saving…' : 'Save quoting settings'}
        </button>
        {msg && (
          <p role="status" className={`text-sm ${msg.ok ? 'text-green' : 'text-red-600'}`}>
            {msg.text}
          </p>
        )}
      </div>
    </div>
  );
}
