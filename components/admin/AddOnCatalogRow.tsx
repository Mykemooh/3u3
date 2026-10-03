'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AddOnCatalogRow({
  addOnId,
  initial,
}: {
  addOnId: string;
  initial: { name: string; description: string | null; defaultPriceCents: number; active: boolean };
}) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description ?? '');
  const [priceDollars, setPriceDollars] = useState((initial.defaultPriceCents / 100).toFixed(2));
  const [active, setActive] = useState(initial.active);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('saving');
    const res = await fetch(`/api/admin/addons/${addOnId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description: description || null, defaultPriceDollars: Number(priceDollars), active }),
    });
    if (res.ok) {
      setStatus('saved');
      router.refresh();
    } else {
      setStatus('error');
    }
  }

  return (
    <form onSubmit={onSubmit} className="card flex flex-wrap items-end gap-3">
      <div className="min-w-[160px] flex-1">
        <label className="label">Name</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="min-w-[200px] flex-[2]">
        <label className="label">Description</label>
        <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional, shown to the client" />
      </div>
      <div>
        <label className="label">Price ($)</label>
        <input
          className="input w-28"
          type="number"
          min={0}
          step="0.01"
          value={priceDollars}
          onChange={(e) => setPriceDollars(e.target.value)}
          required
        />
      </div>
      <label className="flex items-center gap-2 pb-3 text-sm font-medium text-slate">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 accent-gold" />
        Active
      </label>
      <button type="submit" disabled={status === 'saving'} className="btn-primary">
        {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved ✓' : 'Save'}
      </button>
      {status === 'error' && <p className="text-sm text-red-600">Couldn't save.</p>}
    </form>
  );
}
