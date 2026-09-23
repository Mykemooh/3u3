'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Item = { description: string; amountCents: number };

function toDollarsStr(cents: number) {
  return (cents / 100).toFixed(2);
}

// Admin-only editor for a DRAFT invoice: adjust line items, save, then
// send. Saving and sending are separate steps on purpose — an admin should
// be able to fix a typo without accidentally emailing a half-edited amount.
export default function InvoiceEditor({
  invoiceId,
  initialItems,
  clientHasEmail,
  stripeConfigured,
}: {
  invoiceId: string;
  initialItems: Item[];
  clientHasEmail: boolean;
  stripeConfigured: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>(initialItems.length ? initialItems : [{ description: '', amountCents: 0 }]);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const totalCents = items.reduce((sum, i) => sum + (Number.isFinite(i.amountCents) ? i.amountCents : 0), 0);

  function updateItem(idx: number, patch: Partial<Item>) {
    setSaved(false);
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  function addItem() {
    setSaved(false);
    setItems((prev) => [...prev, { description: '', amountCents: 0 }]);
  }

  function removeItem(idx: number) {
    setSaved(false);
    setItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));
  }

  async function saveItems() {
    setSaving(true);
    setError('');
    const res = await fetch(`/api/admin/invoices/${invoiceId}/items`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Could not save.');
      return;
    }
    setSaved(true);
    router.refresh();
  }

  async function sendInvoice() {
    setSending(true);
    setError('');
    // Always save the latest edits first, so "Send" never emails a stale total.
    const saveRes = await fetch(`/api/admin/invoices/${invoiceId}/items`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });
    if (!saveRes.ok) {
      setSending(false);
      const data = await saveRes.json().catch(() => ({}));
      setError(data.error || 'Could not save before sending.');
      return;
    }
    const res = await fetch(`/api/admin/invoices/${invoiceId}/send`, { method: 'POST' });
    setSending(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Could not send.');
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <div className="space-y-3">
        {items.map((item, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <input
              className="input flex-1"
              value={item.description}
              placeholder="Description"
              onChange={(e) => updateItem(idx, { description: e.target.value })}
            />
            <div className="flex items-center gap-1">
              <span className="text-muted">$</span>
              <input
                className="input w-24"
                type="number"
                min="0"
                step="0.01"
                value={toDollarsStr(item.amountCents)}
                onChange={(e) => updateItem(idx, { amountCents: Math.round(parseFloat(e.target.value || '0') * 100) })}
              />
            </div>
            <button
              type="button"
              onClick={() => removeItem(idx)}
              disabled={items.length === 1}
              className="text-muted hover:text-red-600 disabled:opacity-30"
              aria-label="Remove line item"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <button type="button" onClick={addItem} className="mt-3 text-sm font-semibold text-bronze hover:underline">
        + Add line item
      </button>

      <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
        <span className="font-semibold text-ink">Total</span>
        <span className="text-lg font-bold text-ink">${toDollarsStr(totalCents)}</span>
      </div>

      {!clientHasEmail && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
          This client has no email on file — the invoice will be logged but can't be emailed until you add one from
          their client page.
        </p>
      )}
      {!stripeConfigured && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Stripe isn't configured yet (STRIPE_SECRET_KEY) — sending will fail until it's added.
        </p>
      )}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-4 flex items-center gap-3">
        <button type="button" onClick={saveItems} disabled={saving} className="btn-secondary">
          {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save changes'}
        </button>
        <button type="button" onClick={sendInvoice} disabled={sending || totalCents <= 0} className="btn-primary">
          {sending ? 'Sending…' : 'Send invoice'}
        </button>
      </div>
    </div>
  );
}
