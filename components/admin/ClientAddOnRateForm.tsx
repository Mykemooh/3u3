'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ClientAddOnRateForm({
  clientId,
  addOns,
}: {
  clientId: string;
  addOns: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [addOnServiceId, setAddOnServiceId] = useState(addOns[0]?.id ?? '');
  const [priceDollars, setPriceDollars] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('saving');
    const res = await fetch(`/api/admin/clients/${clientId}/addon-rates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ addOnServiceId, priceDollars: Number(priceDollars) }),
    });
    if (res.ok) {
      setPriceDollars('');
      setStatus('idle');
      router.refresh();
    } else {
      setStatus('error');
    }
  }

  if (addOns.length === 0) return null;

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <div>
        <label className="label">Add-on</label>
        <select className="input" value={addOnServiceId} onChange={(e) => setAddOnServiceId(e.target.value)}>
          {addOns.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">This client's price ($)</label>
        <input
          className="input"
          type="number"
          min={0}
          step="0.01"
          value={priceDollars}
          onChange={(e) => setPriceDollars(e.target.value)}
          required
        />
      </div>
      <button type="submit" disabled={status === 'saving'} className="btn-primary">
        {status === 'saving' ? 'Saving…' : 'Save price'}
      </button>
      {status === 'error' && <p className="text-sm text-red-600">Couldn't save — try again.</p>}
    </form>
  );
}
