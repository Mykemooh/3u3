'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Cadence = 'ONE_TIME' | 'BIWEEKLY' | 'MONTHLY';

const CADENCE_LABEL: Record<Cadence, string> = {
  ONE_TIME: 'One-time',
  BIWEEKLY: 'Every other week',
  MONTHLY: 'Monthly',
};

// Admin-only inline editor for a booking's cadence/price — no 24-hour
// cutoff, usable even on a completed/cancelled booking (a correction),
// per app/api/admin/bookings/[id]/route.ts.
export default function BookingCadencePriceEditor({
  bookingId,
  cadence: initialCadence,
  priceDollars: initialPriceDollars,
}: {
  bookingId: string;
  cadence: Cadence;
  priceDollars: number | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [cadence, setCadence] = useState<Cadence>(initialCadence);
  const [priceDollars, setPriceDollars] = useState(initialPriceDollars != null ? String(initialPriceDollars) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    setSaving(true);
    setError('');
    const body: Record<string, unknown> = { cadence };
    if (priceDollars.trim() !== '') body.priceDollars = Number(priceDollars);
    const res = await fetch(`/api/admin/bookings/${bookingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (res.ok) {
      setEditing(false);
      router.refresh();
    } else {
      setError(data.error || "Couldn't save — please try again.");
    }
  }

  if (!editing) {
    return (
      <button onClick={() => setEditing(true)} className="text-xs font-semibold text-bronze hover:underline">
        Edit cadence / price
      </button>
    );
  }

  return (
    <div className="mt-2 flex flex-wrap items-end gap-2 rounded-lg border border-line p-2">
      <div>
        <label className="label !mb-1 !text-xs">Cadence</label>
        <select className="input !py-1.5 !text-sm" value={cadence} onChange={(e) => setCadence(e.target.value as Cadence)}>
          {(Object.keys(CADENCE_LABEL) as Cadence[]).map((c) => (
            <option key={c} value={c}>{CADENCE_LABEL[c]}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label !mb-1 !text-xs">Price ($)</label>
        <input
          className="input !w-28 !py-1.5 !text-sm"
          type="number"
          min={0}
          step="0.01"
          value={priceDollars}
          onChange={(e) => setPriceDollars(e.target.value)}
        />
      </div>
      <button onClick={save} disabled={saving} className="btn-primary btn-sm">
        {saving ? 'Saving…' : 'Save'}
      </button>
      <button onClick={() => setEditing(false)} className="btn-secondary btn-sm" disabled={saving}>
        Cancel
      </button>
      {error && <p className="w-full text-xs text-red-600">{error}</p>}
    </div>
  );
}
