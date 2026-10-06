'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function PayrollRunActions({ runId, status, gustoConnected = false, gustoPushedAt = null }: { runId: string; status: 'OPEN' | 'PAID'; gustoConnected?: boolean; gustoPushedAt?: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  async function sendToGusto() {
    if (!confirm('Send this run’s hours, pay and tips to the open Gusto payroll for this period? Nothing is submitted — you review and run it in Gusto.')) return;
    setBusy(true);
    setError('');
    setNote('');
    const res = await fetch(`/api/admin/payroll/runs/${runId}/gusto`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error || 'Could not send to Gusto.');
    setNote(`Sent ${data.matched.length} to Gusto.${data.unmatched.length ? ` Not found in Gusto by email: ${data.unmatched.join(', ')}.` : ''} Review it in Gusto before you run payroll.`);
    router.refresh();
  }

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
      <a href={`/api/admin/payroll/runs/${runId}/export?format=gusto`} className="btn-secondary">
        Export for Gusto
      </a>
      {gustoConnected && (
        <button onClick={sendToGusto} disabled={busy} className="btn-secondary">
          {gustoPushedAt ? 'Send to Gusto again' : 'Send to Gusto'}
        </button>
      )}
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
      {note && <p className="w-full text-sm text-slate" role="status">{note}</p>}
    </div>
  );
}
