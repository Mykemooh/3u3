'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Settings = {
  percentPayBasis: 'BASE_PRICE' | 'INVOICE_TOTAL';
  hourlyPayModel: 'ACTUAL_TIME' | 'TARGET_TIME';
  tipSplitMethod: 'EVEN' | 'BY_HOURS';
};

export default function TenantSettingsForm({ initial }: { initial: Settings }) {
  const router = useRouter();
  const [settings, setSettings] = useState<Settings>(initial);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  async function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    const next = { ...settings, [key]: value };
    setSettings(next);
    setStatus('saving');
    const res = await fetch('/api/admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: value }),
    });
    if (res.ok) {
      setStatus('saved');
      router.refresh();
    } else {
      setStatus('error');
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-2 font-semibold text-ink">Percentage pay basis</h3>
        <p className="mb-3 text-sm text-slate">
          What a <strong>Percentage of job price</strong> employee's cut is computed on.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {([
            { value: 'BASE_PRICE', label: 'Base cleaning price', desc: 'Just the agreed cleaning rate — add-on revenue isn\'t shared this way.' },
            { value: 'INVOICE_TOTAL', label: 'Full invoice total', desc: 'The whole invoice, including any add-on services on that visit.' },
          ] as const).map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => update('percentPayBasis', o.value)}
              className={`rounded-xl border-2 p-3 text-left transition ${
                settings.percentPayBasis === o.value ? 'border-gold bg-gold/10' : 'border-line hover:border-gold'
              }`}
            >
              <span className="block font-medium text-ink">{o.label}</span>
              <span className="block text-xs text-slate">{o.desc}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-2 font-semibold text-ink">Hourly pay model</h3>
        <p className="mb-3 text-sm text-slate">How an <strong>Hourly</strong> employee's pay is calculated for each job.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {([
            { value: 'ACTUAL_TIME', label: 'Actual clocked time', desc: 'Pay follows exactly what they clocked in/out — the original behavior.' },
            { value: 'TARGET_TIME', label: 'Target clean time', desc: "Pay is based on the home's target time, not the clock — finishing faster never cuts their pay." },
          ] as const).map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => update('hourlyPayModel', o.value)}
              className={`rounded-xl border-2 p-3 text-left transition ${
                settings.hourlyPayModel === o.value ? 'border-gold bg-gold/10' : 'border-line hover:border-gold'
              }`}
            >
              <span className="block font-medium text-ink">{o.label}</span>
              <span className="block text-xs text-slate">{o.desc}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-2 font-semibold text-ink">Tip split method</h3>
        <p className="mb-3 text-sm text-slate">How a job's tip is divided across whoever was staffed on it.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {([
            { value: 'EVEN', label: 'Split evenly', desc: 'Every staffer on the job gets an equal share.' },
            { value: 'BY_HOURS', label: 'Split by hours worked', desc: 'Weighted by time on the job — currently the same as even, until per-person time tracking exists.' },
          ] as const).map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => update('tipSplitMethod', o.value)}
              className={`rounded-xl border-2 p-3 text-left transition ${
                settings.tipSplitMethod === o.value ? 'border-gold bg-gold/10' : 'border-line hover:border-gold'
              }`}
            >
              <span className="block font-medium text-ink">{o.label}</span>
              <span className="block text-xs text-slate">{o.desc}</span>
            </button>
          ))}
        </div>
      </div>

      <p className="text-sm text-muted">
        {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved ✓' : status === 'error' ? "Couldn't save — try again." : ' '}
      </p>
    </div>
  );
}
