'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function BillingModeForm({ clientId, initialMode }: { clientId: string; initialMode: 'PER_CLEAN' | 'MONTHLY_BATCH' }) {
  const router = useRouter();
  const [mode, setMode] = useState(initialMode);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  async function save(next: 'PER_CLEAN' | 'MONTHLY_BATCH') {
    setMode(next);
    setStatus('saving');
    const res = await fetch(`/api/admin/clients/${clientId}/billing-mode`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ billingMode: next }),
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
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => save('PER_CLEAN')}
          className={`rounded-xl border-2 p-3 text-left text-sm transition ${mode === 'PER_CLEAN' ? 'border-gold bg-gold/10' : 'border-line hover:border-gold'}`}
        >
          <span className="block font-medium text-ink">Per clean</span>
          <span className="block text-xs text-slate">Each visit is its own invoice.</span>
        </button>
        <button
          type="button"
          onClick={() => save('MONTHLY_BATCH')}
          className={`rounded-xl border-2 p-3 text-left text-sm transition ${mode === 'MONTHLY_BATCH' ? 'border-gold bg-gold/10' : 'border-line hover:border-gold'}`}
        >
          <span className="block font-medium text-ink">Monthly statement</span>
          <span className="block text-xs text-slate">All this month's visits billed together at month end.</span>
        </button>
      </div>
      {status === 'saving' && <p className="mt-2 text-xs text-muted">Saving…</p>}
      {status === 'error' && <p className="mt-2 text-xs text-red-600">Couldn't save — try again.</p>}
    </div>
  );
}
