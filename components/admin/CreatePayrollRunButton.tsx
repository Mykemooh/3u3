'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function CreatePayrollRunButton({ start, end }: { start: string; end: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState(`${start} to ${end}`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function create() {
    setBusy(true);
    setError('');
    const res = await fetch('/api/admin/payroll/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label, periodStart: start, periodEnd: end }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error || 'Could not create that run.');
    router.push(`/admin/payroll/${data.runId}`);
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-primary !px-4 !py-2 text-sm">
        Create payroll run
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input value={label} onChange={(e) => setLabel(e.target.value)} className="input !py-1.5 text-sm" placeholder="Pay period label" />
      <button type="button" onClick={create} disabled={busy} className="btn-primary !px-4 !py-2 text-sm">
        {busy ? 'Creating…' : 'Confirm'}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-sm text-muted hover:text-ink">
        Cancel
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
