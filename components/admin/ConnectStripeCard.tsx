'use client';

import { useEffect, useState } from 'react';

/** Settings → Payments: connect the company's own Stripe account (lib/connect.ts). */
export default function ConnectStripeCard({ connected, ready, returning, canManage }: { connected: boolean; ready: boolean; returning: boolean; canManage: boolean }) {
  const [state, setState] = useState({ connected, ready });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!returning) return;
    fetch('/api/admin/connect')
      .then((r) => r.json())
      .then((d) => d && typeof d.ready === 'boolean' && setState({ connected: d.connected, ready: d.ready }))
      .catch(() => undefined);
  }, [returning]);

  async function go(method: 'POST' | 'PUT') {
    setBusy(true);
    setError('');
    const res = await fetch('/api/admin/connect', { method });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok || !data.url) return setError(data.error ?? 'Something went wrong.');
    window.location.href = data.url;
  }

  return (
    <div className="mt-4 rounded-xl bg-surface p-4">
      <p className="font-semibold text-ink">Your own Stripe account</p>
      {state.ready ? (
        <p className="mt-1 text-sm text-slate">Connected. Client payments, monthly statements and tips go straight to your bank.</p>
      ) : state.connected ? (
        <p className="mt-1 text-sm text-slate">Started — Stripe needs a few more details before payments can go to your bank. Until then they keep working through the platform account.</p>
      ) : (
        <p className="mt-1 text-sm text-slate">Connect your own Stripe account so client payments go straight to your bank. Stripe asks for your business and bank details on its own secure pages.</p>
      )}
      {canManage ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {!state.ready && (
            <button type="button" className="btn-primary !px-4 !py-2 text-sm" disabled={busy} onClick={() => go('POST')}>
              {busy ? 'Opening Stripe…' : state.connected ? 'Finish connecting' : 'Connect Stripe'}
            </button>
          )}
          {state.connected && (
            <button type="button" className="btn-secondary !px-4 !py-2 text-sm" disabled={busy} onClick={() => go('PUT')}>
              Open my Stripe dashboard
            </button>
          )}
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted">Only roles with Billing access can connect Stripe.</p>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
