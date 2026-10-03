'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import PhoneInput from '@/components/PhoneInput';

export default function RateForm({ services }: { services: { id: string; name: string }[] }) {
  const router = useRouter();
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [serviceTypeId, setServiceTypeId] = useState(services[0]?.id ?? '');
  const [rateDollars, setRateDollars] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  // PhoneInput keeps its own local state after mount, so clearing
  // clientPhone alone wouldn't clear what it displays — remount it instead.
  const [phoneFieldKey, setPhoneFieldKey] = useState(0);

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
      setPhoneFieldKey((k) => k + 1);
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
        <PhoneInput key={phoneFieldKey} value={clientPhone} onChange={setClientPhone} required />
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
