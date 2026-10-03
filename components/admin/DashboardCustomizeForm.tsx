'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function DashboardCustomizeForm({
  widgets,
  initialHidden,
  initialSupplyCostCents,
}: {
  widgets: { key: string; label: string }[];
  initialHidden: string[];
  initialSupplyCostCents: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(new Set(initialHidden));
  const [supplyCost, setSupplyCost] = useState((initialSupplyCostCents / 100).toFixed(2));
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  async function save(nextHidden: Set<string>, nextSupplyCost: string) {
    setStatus('saving');
    await fetch('/api/admin/dashboard-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hiddenWidgets: [...nextHidden], avgSupplyCostDollars: Number(nextSupplyCost) }),
    });
    setStatus('saved');
    router.refresh();
  }

  function toggle(key: string) {
    const next = new Set(hidden);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setHidden(next);
    save(next, supplyCost);
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-secondary !px-3 !py-1.5 text-sm">
        Customize
      </button>
    );
  }

  return (
    <div className="card max-w-md">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold text-ink">Customize dashboard</h3>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-muted hover:text-ink">
          Done
        </button>
      </div>
      <div className="space-y-2">
        {widgets.map((w) => (
          <label key={w.key} className="flex items-center gap-2 text-sm text-slate">
            <input type="checkbox" checked={!hidden.has(w.key)} onChange={() => toggle(w.key)} className="h-4 w-4 accent-gold" />
            {w.label}
          </label>
        ))}
      </div>
      <div className="mt-4 border-t border-line pt-4">
        <label className="label">Estimated supply cost per clean ($)</label>
        <div className="flex items-center gap-2">
          <input
            className="input w-28"
            type="number"
            min={0}
            step="0.01"
            value={supplyCost}
            onChange={(e) => setSupplyCost(e.target.value)}
            onBlur={() => save(hidden, supplyCost)}
          />
          <span className="text-xs text-muted">used by Profit per clean</span>
        </div>
      </div>
      {status === 'saving' && <p className="mt-2 text-xs text-muted">Saving…</p>}
    </div>
  );
}
