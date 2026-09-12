'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ClientRateForm({
  clientId,
  services,
}: {
  clientId: string;
  services: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [serviceTypeId, setServiceTypeId] = useState(services[0]?.id ?? '');
  const [rateDollars, setRateDollars] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('saving');
    const res = await fetch(`/api/admin/clients/${clientId}/rates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serviceTypeId, rateDollars: Number(rateDollars) }),
    });
    if (res.ok) {
      setRateDollars('');
      setStatus('idle');
      router.refresh();
    } else {
      setStatus('error');
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <div>
        <label className="label">Service</label>
        <select className="input" value={serviceTypeId} onChange={(e) => setServiceTypeId(e.target.value)}>
          {services.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Agreed rate ($)</label>
        <input
          className="input"
          type="number"
          min={0}
          step="0.01"
          value={rateDollars}
          onChange={(e) => setRateDollars(e.target.value)}
          required
        />
      </div>
      <button type="submit" disabled={status === 'saving'} className="btn-primary">
        {status === 'saving' ? 'Saving…' : 'Save rate'}
      </button>
      {status === 'error' && <p className="text-sm text-red-600">Couldn't save — try again.</p>}
    </form>
  );
}
