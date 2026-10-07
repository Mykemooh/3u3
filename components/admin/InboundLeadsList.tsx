'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Lead = {
  id: string;
  source: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  service: string | null;
  message: string | null;
  status: 'NEW' | 'CONTACTED' | 'CONVERTED' | 'DISMISSED';
  clientId: string | null;
  duplicateCount: number;
  lastReceivedAt: string;
};

const when = (iso: string) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** Leads sent in from other sites by API (lib/inboundLeads.ts). */
export default function InboundLeadsList({ leads }: { leads: Lead[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function setStatus(id: string, status: Lead['status']) {
    setBusy(id);
    setError('');
    const res = await fetch(`/api/admin/leads/inbound/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    setBusy(null);
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error ?? 'Couldn’t save.');
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {leads.map((l) => (
        <div key={l.id} className="card flex flex-col gap-3 !p-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-ink">{l.name}</p>
              <span className="pill bg-surface text-slate">{l.source}</span>
              <span className={`pill ${l.status === 'NEW' ? 'bg-amber-100 text-amber-700' : 'bg-gold/10 text-bronze'}`}>{l.status === 'NEW' ? 'New' : 'Contacted'}</span>
              {l.clientId && <span className="pill bg-green-light text-green">Already a client</span>}
              {l.duplicateCount > 0 && <span className="pill bg-surface text-slate">Sent {l.duplicateCount + 1} times</span>}
            </div>
            <p className="mt-1 text-sm text-slate">
              {l.phone && <a className="text-bronze hover:underline" href={`tel:${l.phone}`}>{l.phone}</a>}
              {l.phone && l.email && ' · '}
              {l.email && <a className="text-bronze hover:underline" href={`mailto:${l.email}`}>{l.email}</a>}
            </p>
            {l.address && <p className="text-sm text-slate">{l.address}</p>}
            {l.service && <p className="text-sm text-slate">Wants: {l.service}</p>}
            {l.message && <p className="mt-1 whitespace-pre-line text-sm text-ink">{l.message}</p>}
            <p className="mt-1 text-xs text-muted">Last received {when(l.lastReceivedAt)}</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-1 text-sm">
            {l.clientId && (
              <a href={`/admin/clients/${l.clientId}`} className="rounded-lg px-2 py-1 font-semibold text-bronze hover:bg-surface">View client</a>
            )}
            {l.status === 'NEW' && (
              <button type="button" disabled={busy === l.id} className="rounded-lg px-2 py-1 text-slate hover:bg-surface" onClick={() => setStatus(l.id, 'CONTACTED')}>
                Mark contacted
              </button>
            )}
            <button type="button" disabled={busy === l.id} className="rounded-lg px-2 py-1 text-slate hover:bg-surface" onClick={() => setStatus(l.id, 'CONVERTED')}>
              Booked
            </button>
            <button type="button" disabled={busy === l.id} className="rounded-lg px-2 py-1 text-slate hover:bg-surface hover:text-red-600" onClick={() => setStatus(l.id, 'DISMISSED')}>
              Dismiss
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
