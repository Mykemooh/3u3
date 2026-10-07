'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

/** Start a quote for any client — not only from a lead's walkthrough. */
export default function NewEstimateForm({
  clients,
  services,
  startOpen,
}: {
  clients: { id: string; name: string; phone: string | null }[];
  services: { id: string; name: string }[];
  startOpen: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(startOpen);
  const [clientId, setClientId] = useState('');
  const [serviceTypeId, setServiceTypeId] = useState(services[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function start(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId || !serviceTypeId) return setError('Pick a client and a service.');
    setBusy(true);
    setError('');
    const res = await fetch('/api/admin/estimates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, serviceTypeId }),
    }).catch(() => null);
    const data = await res?.json().catch(() => ({}));
    setBusy(false);
    if (!res?.ok) return setError(data?.error || 'Could not start the quote. Try again.');
    router.push(`/admin/estimates/${data.quoteId}`);
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-primary">
        + New quote
      </button>
    );
  }
  if (clients.length === 0 || services.length === 0) {
    return (
      <div className="card text-sm text-slate">
        {clients.length === 0 ? (
          <>Add the client first, then come back to quote them. <Link href="/admin/clients" className="font-semibold text-ink underline">Add a client</Link></>
        ) : (
          <>Turn on at least one service before quoting. <Link href="/admin/services" className="font-semibold text-ink underline">Services</Link></>
        )}
      </div>
    );
  }
  return (
    <form onSubmit={start} className="card grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <label className="block">
        <span className="label">Client</span>
        <select className="input" value={clientId} onChange={(e) => setClientId(e.target.value)} required autoFocus>
          <option value="">Choose a client…</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="label">Service</span>
        <select className="input" value={serviceTypeId} onChange={(e) => setServiceTypeId(e.target.value)} required>
          {services.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </label>
      <div className="flex gap-2">
        <button className="btn-primary" disabled={busy}>{busy ? 'Opening…' : 'Start quote'}</button>
        <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
      </div>
      {error && <p className="text-sm text-red-600 sm:col-span-3">{error}</p>}
    </form>
  );
}
