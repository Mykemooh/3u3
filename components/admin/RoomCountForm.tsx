'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const OPTIONS = [1, 2, 3, 4, 5, 6];

export default function RoomCountForm({
  addressId,
  initial,
}: {
  addressId: string;
  initial: { bedrooms: number | null; bathrooms: number | null; targetCleanMinutes: number | null };
}) {
  const router = useRouter();
  const [bedrooms, setBedrooms] = useState(initial.bedrooms ? String(initial.bedrooms) : '');
  const [bathrooms, setBathrooms] = useState(initial.bathrooms ? String(initial.bathrooms) : '');
  const [targetMinutes, setTargetMinutes] = useState(initial.targetCleanMinutes ? String(initial.targetCleanMinutes) : '');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  async function save() {
    setStatus('saving');
    const res = await fetch(`/api/admin/addresses/${addressId}/rooms`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bedrooms: bedrooms ? Number(bedrooms) : null,
        bathrooms: bathrooms ? Number(bathrooms) : null,
        targetCleanMinutes: targetMinutes ? Number(targetMinutes) : null,
      }),
    });
    if (res.ok) {
      setStatus('saved');
      router.refresh();
    } else {
      setStatus('error');
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <label className="label">Bedrooms</label>
        <select className="input" value={bedrooms} onChange={(e) => setBedrooms(e.target.value)}>
          <option value="">Not set</option>
          {OPTIONS.map((n) => (
            <option key={n} value={n}>{n}{n === 6 ? '+' : ''}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Bathrooms</label>
        <select className="input" value={bathrooms} onChange={(e) => setBathrooms(e.target.value)}>
          <option value="">Not set</option>
          {OPTIONS.map((n) => (
            <option key={n} value={n}>{n}{n === 6 ? '+' : ''}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Target clean time (min)</label>
        <input
          className="input w-28"
          type="number"
          min={15}
          step={15}
          value={targetMinutes}
          onChange={(e) => setTargetMinutes(e.target.value)}
          placeholder="e.g. 120"
        />
      </div>
      <button type="button" onClick={save} disabled={status === 'saving'} className="btn-secondary !px-4 !py-2.5 text-sm">
        {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved ✓' : 'Save'}
      </button>
      {status === 'error' && <p className="text-sm text-red-600">Couldn't save — try again.</p>}
    </div>
  );
}
