'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import AddressInput, { type PickedAddress } from '@/components/AddressInput';
import PhoneInput from '@/components/PhoneInput';

export default function NewClientForm({ startOpen = false }: { startOpen?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(startOpen);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [locale, setLocale] = useState<'en' | 'es'>('en');
  const [addressLine1, setAddressLine1] = useState('');
  const [address, setAddress] = useState<PickedAddress | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle');
  const [error, setError] = useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('saving');
    setError('');
    const res = await fetch('/api/admin/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone, email: email || undefined, addressLine1: addressLine1 || undefined, address: address ?? undefined, locale }),
    });
    const data = await res.json().catch(() => ({}));
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
        <label className="label" htmlFor="new-client-name">Full name</label>
        <input id="new-client-name" className="input" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div>
        <label className="label" htmlFor="new-client-phone">Phone number</label>
        <PhoneInput id="new-client-phone" value={phone} onChange={setPhone} required />
      </div>
      <div>
        <label className="label" htmlFor="new-client-email">Email (optional)</label>
        <input id="new-client-email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="new-client-address">Home address (optional)</label>
        <AddressInput id="new-client-address" value={addressLine1} onChange={setAddressLine1} picked={address} onPick={setAddress} />
      </div>
      <div>
        <label className="label" htmlFor="new-client-locale">Language</label>
        <select id="new-client-locale" className="input" value={locale} onChange={(e) => setLocale(e.target.value === 'es' ? 'es' : 'en')}>
          <option value="en">English</option>
          <option value="es">Español</option>
        </select>
        <p className="mt-1 text-xs text-muted">For their emails and texts.</p>
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
