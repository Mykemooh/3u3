'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import AddressInput, { type PickedAddress } from '@/components/AddressInput';

export default function AddressForm({
  endpoint,
  initial,
  onSaved,
}: {
  endpoint: string;
  initial: { line1: string; city: string; state: string; zip?: string | null; notes?: string | null };
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [line1, setLine1] = useState(initial.line1 ?? '');
  const [city, setCity] = useState(initial.city ?? '');
  const [state, setState] = useState(initial.state ?? '');
  const [zip, setZip] = useState(initial.zip ?? '');
  const [notes, setNotes] = useState(initial.notes ?? '');
  const [picked, setPicked] = useState<PickedAddress | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle');
  const [error, setError] = useState('');

  function onPick(address: PickedAddress | null) {
    setPicked(address);
    if (address) {
      setLine1(address.line1);
      setCity(address.city);
      setState(address.state);
      setZip(address.zip);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('saving');
    setError('');
    const res = await fetch(endpoint, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ line1, city, state, zip, notes }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setStatus('idle');
      setEditing(false);
      router.refresh();
      onSaved?.();
    } else {
      setStatus('error');
      setError(data.error || "Couldn't save — please try again.");
    }
  }

  if (!editing) {
    return (
      <div className="flex items-start justify-between gap-4">
        <div className="text-sm text-slate">
          {initial.line1 ? (
            <>
              <p className="font-medium text-ink">{initial.line1}</p>
              <p>
                {initial.city}, {initial.state} {initial.zip}
              </p>
              {initial.notes && (
                <p className="mt-2 rounded-lg bg-gold/10 px-3 py-2 text-xs text-ink">
                  <span className="font-semibold text-bronze">Cleaner needs to know: </span>
                  {initial.notes}
                </p>
              )}
            </>
          ) : (
            <p className="text-muted">No address on file yet.</p>
          )}
        </div>
        <button onClick={() => setEditing(true)} className="btn-secondary !px-4 !py-2 text-sm">
          {initial.line1 ? 'Edit' : 'Add address'}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <label className="label">Street address</label>
        <AddressInput value={line1} onChange={setLine1} picked={picked} onPick={onPick} required />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-1">
          <label className="label">City</label>
          <input className="input" value={city} onChange={(e) => setCity(e.target.value)} required />
        </div>
        <div>
          <label className="label">State</label>
          <input className="input" value={state} onChange={(e) => setState(e.target.value)} maxLength={2} required />
        </div>
        <div>
          <label className="label">ZIP</label>
          <input className="input" value={zip} onChange={(e) => setZip(e.target.value)} />
        </div>
      </div>
      <div>
        <label className="label">Cleaner needs to know</label>
        <textarea
          className="input"
          rows={3}
          placeholder="Pets, gate or lockbox codes, parking, anything the crew should know before they arrive"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <p className="mt-1 text-xs text-muted">Shown to the crew on this job — they'll see it before they can start.</p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={status === 'saving'} className="btn-primary !px-4 !py-2 text-sm">
          {status === 'saving' ? 'Saving…' : 'Save address'}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="btn-secondary !px-4 !py-2 text-sm"
          disabled={status === 'saving'}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
