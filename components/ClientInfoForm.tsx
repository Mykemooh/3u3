'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import PhoneInput from '@/components/PhoneInput';

export default function ClientInfoForm({
  clientId,
  initial,
}: {
  clientId: string;
  initial: { name: string; phone: string | null; email: string | null };
}) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [phone, setPhone] = useState(initial.phone ?? '');
  const [email, setEmail] = useState(initial.email ?? '');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('saving');
    setError('');
    const res = await fetch(`/api/admin/clients/${clientId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone, email }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setStatus('saved');
      router.refresh();
    } else {
      setStatus('error');
      setError(data.error || "Couldn't save — please try again.");
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div>
        <label className="label">Name</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div>
        <label className="label">Phone</label>
        <PhoneInput value={phone} onChange={setPhone} />
      </div>
      <div>
        <label className="label">Email</label>
        <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="sm:col-span-3">
        <button type="submit" disabled={status === 'saving'} className="btn-primary btn-sm">
          {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved ✓' : 'Save client info'}
        </button>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>
    </form>
  );
}
