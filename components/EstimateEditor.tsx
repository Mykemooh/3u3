'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Item = { description: string; amountCents: number };

function toDollarsStr(cents: number) {
  return (cents / 100).toFixed(2);
}

/**
 * Admin editor for a DRAFT estimate. Same two-step shape as the invoice
 * editor — save and send are separate, so a typo can be fixed without
 * accidentally emailing a half-edited price to the client.
 */
export default function EstimateEditor({
  quoteId,
  initialItems,
  initialNotes,
  initialServiceTypeId,
  services,
  clientHasEmail,
}: {
  quoteId: string;
  initialItems: Item[];
  initialNotes: string;
  initialServiceTypeId: string;
  services: { id: string; name: string }[];
  clientHasEmail: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>(
    initialItems.length ? initialItems : [{ description: '', amountCents: 0 }],
  );
  const [notes, setNotes] = useState(initialNotes);
  const [serviceTypeId, setServiceTypeId] = useState(initialServiceTypeId);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [sentLink, setSentLink] = useState('');

  const totalCents = items.reduce((sum, i) => sum + (Number.isFinite(i.amountCents) ? i.amountCents : 0), 0);

  function touch() {
    setSaved(false);
    setError('');
  }

  function updateItem(idx: number, patch: Partial<Item>) {
    touch();
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  async function save(): Promise<boolean> {
    const res = await fetch(`/api/admin/estimates/${quoteId}/items`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, notes, serviceTypeId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Could not save.');
      return false;
    }
    return true;
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    const ok = await save();
    setSaving(false);
    if (ok) {
      setSaved(true);
      router.refresh();
    }
  }

  async function handleSend() {
    setSending(true);
    setError('');
    // Always persist the latest edits first, so "Send" can never email a
    // price the admin has since changed on screen.
    if (!(await save())) {
      setSending(false);
      return;
    }
    const res = await fetch(`/api/admin/estimates/${quoteId}/send`, { method: 'POST' });
    setSending(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || 'Could not send.');
      return;
    }
    // If email isn't configured (or the client has none on file) the link
    // is still live — surface it so it can be texted over instead.
    if (!data.emailed && data.url) setSentLink(data.url);
    router.refresh();
  }

  return (
    <div>
      <label className="label" htmlFor="estimate-service">
        Service
      </label>
      <select
        id="estimate-service"
        className="input mb-5"
        value={serviceTypeId}
        onChange={(e) => {
          touch();
          setServiceTypeId(e.target.value);
        }}
      >
        {services.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>

      <div className="space-y-3">
        {items.map((item, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <input
              className="input flex-1"
              value={item.description}
              placeholder="What's included"
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
                onChange={(e) =>
                  updateItem(idx, { amountCents: Math.round(parseFloat(e.target.value || '0') * 100) })
                }
              />
            </div>
            <button
              type="button"
              onClick={() => {
                touch();
                setItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));
              }}
              disabled={items.length === 1}
              className="text-muted hover:text-red-600 disabled:opacity-30"
              aria-label="Remove line"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => {
          touch();
          setItems((prev) => [...prev, { description: '', amountCents: 0 }]);
        }}
        className="mt-3 text-sm font-semibold text-bronze hover:underline"
      >
        + Add line
      </button>

      <label className="label mt-5" htmlFor="estimate-notes">
        Note to the client <span className="font-normal text-muted">(optional)</span>
      </label>
      <textarea
        id="estimate-notes"
        className="input min-h-[80px]"
        placeholder="Anything worth saying about the price or what's included."
        value={notes}
        onChange={(e) => {
          touch();
          setNotes(e.target.value);
        }}
      />

      <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
        <span className="font-semibold text-ink">Total</span>
        <span className="text-lg font-bold text-ink">${toDollarsStr(totalCents)}</span>
      </div>

      {!clientHasEmail && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
          No email on file for this client — sending still creates the approval link, but you'll need to text it to
          them. Add an email on their client page to send it automatically.
        </p>
      )}
      {sentLink && (
        <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <p className="font-semibold">Estimate created, but not emailed.</p>
          <p className="mt-1 break-all font-mono text-xs">{sentLink}</p>
          <p className="mt-1">Send that link to the client and they can approve it from their phone.</p>
        </div>
      )}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-4 flex items-center gap-3">
        <button type="button" onClick={handleSave} disabled={saving} className="btn-secondary">
          {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save draft'}
        </button>
        <button type="button" onClick={handleSend} disabled={sending || totalCents <= 0} className="btn-primary">
          {sending ? 'Sending…' : 'Send to client'}
        </button>
      </div>
    </div>
  );
}
