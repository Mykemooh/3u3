'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function PayrollRunActions({ runId, status }: { runId: string; status: 'OPEN' | 'PAID' }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function act(action: 'pay' | 'void') {
    if (action === 'pay' && !confirm('Mark this run paid? Each cleaner with an email on file will be sent what they were paid.')) return;
    if (action === 'void' && !confirm('Void this run? Its jobs go back into the payable pool for a future run.')) return;
    setBusy(true);
    setError('');
    const res = await fetch(`/api/admin/payroll/runs/${runId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error || 'Could not do that.');
    if (action === 'void') router.push('/admin/payroll');
    else router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <a href={`/api/admin/payroll/runs/${runId}/export`} className="btn-secondary">
        Export CSV
      </a>
      {status === 'OPEN' && (
        <>
          <button onClick={() => act('pay')} disabled={busy} className="btn-primary">
            Mark as paid
          </button>
          <button onClick={() => act('void')} disabled={busy} className="text-sm text-muted hover:text-ink">
            Void this run
          </button>
        </>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
