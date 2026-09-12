'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function NewClientForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle');
  const [error, setError] = useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('saving');
    setError('');
    const res = await fetch('/api/admin/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone, email: email || undefined, addressLine1: addressLine1 || undefined }),
    });
    const data = await res.json();
    if (!res.ok) {
      setStatus('error');
      setError(data.error || 'Could not create client.');
      return;
    }
    router.push(`/admin/clients/${data.clientId}`);
    router.refresh();
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-primary">
        + New client
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="card grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div>
        <label className="label">Full name</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div>
        <label className="label">Phone number</label>
        <input className="input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
      </div>
      <div>
        <label className="label">Email (optional)</label>
        <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <label className="label">Home address (optional)</label>
        <input className="input" value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} />
      </div>
      {error && <p className="sm:col-span-2 text-sm text-red-600">{error}</p>}
      <div className="flex gap-3 sm:col-span-2">
        <button type="submit" disabled={status === 'saving'} className="btn-primary">
          {status === 'saving' ? 'Saving…' : 'Create client'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn-secondary">
          Cancel
        </button>
      </div>
    </form>
  );
}
