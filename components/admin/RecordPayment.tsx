'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

const METHODS: [string, string][] = [
  ['CASH', 'Cash'],
  ['CHECK', 'Check'],
  ['BANK_TRANSFER', 'Bank transfer / Zelle'],
  ['CARD_ELSEWHERE', 'Card, taken elsewhere'],
  ['OTHER', 'Other'],
];

/** Mark an invoice paid when the money came in some other way. */
export default function RecordPayment({ invoiceId, amount }: { invoiceId: string; amount: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState('CASH');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await fetch(`/api/admin/invoices/${invoiceId}/payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method, note: note || undefined }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const data = await res?.json().catch(() => ({}));
      setError(data?.error || 'Could not record the payment. Try again.');
      return;
    }
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-secondary btn-sm">
        Record a payment
      </button>
    );
  }
  return (
    <form onSubmit={save} className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <p className="text-sm font-semibold text-ink">Record {amount} as paid</p>
      <label className="block">
        <span className="label">How they paid</span>
        <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
          {METHODS.map(([k, l]) => (
            <option key={k} value={k}>{l}</option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="label">Note (optional)</span>
        <input className="input" value={note} maxLength={200} placeholder="e.g. Check #1042" onChange={(e) => setNote(e.target.value)} />
      </label>
      <p className="text-xs text-muted">The client gets a payment receipt email, and the invoice shows as paid everywhere.</p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button className="btn-primary btn-sm" disabled={busy}>{busy ? 'Saving…' : 'Mark as paid'}</button>
        <button type="button" className="btn-secondary btn-sm" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}
