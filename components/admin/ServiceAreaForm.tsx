'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ServiceAreaForm({ initialRadiusMiles, hasCrewHomeBase }: { initialRadiusMiles: number; hasCrewHomeBase: boolean }) {
  const router = useRouter();
  const [radius, setRadius] = useState(String(initialRadiusMiles));
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  async function save() {
    setStatus('saving');
    const res = await fetch('/api/admin/service-area', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serviceAreaRadiusMiles: Number(radius) }),
    });
    if (res.ok) {
      setStatus('saved');
      router.refresh();
    } else {
      setStatus('error');
    }
  }

  return (
    <div>
      <p className="mb-3 text-sm text-slate">
        New leads are checked against this radius using real driving distance (not a straight-line guess) from your
        nearest team's home base, and flagged on the Leads page when they fall outside it — nothing is ever
        auto-rejected; it's always your call.
      </p>
      {!hasCrewHomeBase && (
        <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
          No team has a home base address set yet (Admin → Team), so this isn't being checked against anything —
          leads won't be flagged until at least one team's home base is set.
        </p>
      )}
      <div className="flex items-end gap-3">
        <div>
          <label className="label">Service radius</label>
          <div className="flex items-center gap-2">
            <input className="input w-24" type="number" min={1} max={200} value={radius} onChange={(e) => setRadius(e.target.value)} />
            <span className="text-sm text-slate">miles</span>
          </div>
        </div>
        <button type="button" onClick={save} disabled={status === 'saving'} className="btn-primary">
          {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved ✓' : 'Save'}
        </button>
      </div>
      {status === 'error' && <p className="mt-2 text-sm text-red-600">Couldn't save — try again.</p>}
    </div>
  );
}
