'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function RateForm({ services }: { services: { id: string; name: string }[] }) {
  const router = useRouter();
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [serviceTypeId, setServiceTypeId] = useState(services[0]?.id ?? '');
  const [rateDollars, setRateDollars] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('saving');
    const res = await fetch('/api/admin/rates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientName,
        clientPhone,
        serviceTypeId,
        rateDollars: Number(rateDollars),
      }),
    });
    if (res.ok) {
      setStatus('saved');
      setClientName('');
      setClientPhone('');
      setRateDollars('');
      router.refresh();
    } else {
      setStatus('error');
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div>
        <label className="label">Client name</label>
        <input className="input" value={clientName} onChange={(e) => setClientName(e.target.value)} required />
      </div>
      <div>
        <label className="label">Client phone</label>
        <input
          className="input"
          type="tel"
          value={clientPhone}
          onChange={(e) => setClientPhone(e.target.value)}
          placeholder="+1 (281) 555-0100"
          required
        />
      </div>
      <div>
        <label className="label">Service</label>
        <select className="input" value={serviceTypeId} onChange={(e) => setServiceTypeId(e.target.value)}>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
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
      <div className="sm:col-span-2">
        <button type="submit" disabled={status === 'saving'} className="btn-primary">
          {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved ✓' : 'Save rate'}
        </button>
        {status === 'error' && <p className="mt-2 text-sm text-red-600">Couldn't save — please try again.</p>}
      </div>
    </form>
  );
}
