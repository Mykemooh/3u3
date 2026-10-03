'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AddOnCatalogCreateForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [priceDollars, setPriceDollars] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('saving');
    const res = await fetch('/api/admin/addons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description: description || undefined, defaultPriceDollars: Number(priceDollars) }),
    });
    if (res.ok) {
      setName('');
      setDescription('');
      setPriceDollars('');
      setStatus('idle');
      router.refresh();
    } else {
      setStatus('error');
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <div className="min-w-[160px] flex-1">
        <label className="label">Name</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Inside fridge" required />
      </div>
      <div className="min-w-[200px] flex-[2]">
        <label className="label">Description</label>
        <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional, shown to the client" />
      </div>
      <div>
        <label className="label">Price ($)</label>
        <input className="input w-28" type="number" min={0} step="0.01" value={priceDollars} onChange={(e) => setPriceDollars(e.target.value)} required />
      </div>
      <button type="submit" disabled={status === 'saving'} className="btn-primary">
        {status === 'saving' ? 'Adding…' : '+ Add service'}
      </button>
      {status === 'error' && <p className="text-sm text-red-600">Couldn't save — try again.</p>}
    </form>
  );
}
