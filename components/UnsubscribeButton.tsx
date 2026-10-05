'use client';

import { useState } from 'react';

export default function UnsubscribeButton({ u, t, optedOut }: { u: string; t: string; optedOut: boolean }) {
  const [out, setOut] = useState(optedOut);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function go(resubscribe: boolean) {
    setBusy(true);
    setError('');
    const res = await fetch('/api/unsubscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ u, t, resubscribe }) });
    setBusy(false);
    if (!res.ok) return setError('That didn’t work — please try again.');
    setOut(!resubscribe);
  }
  return (
    <div className="mt-6">
      {out ? (
        <>
          <p className="font-semibold text-green">You’re unsubscribed from news and offers.</p>
          <button className="btn-secondary mt-3" disabled={busy} onClick={() => go(true)}>
            Changed your mind? Subscribe again
          </button>
        </>
      ) : (
        <button className="btn-primary" disabled={busy} onClick={() => go(false)}>
          {busy ? 'One moment…' : 'Unsubscribe'}
        </button>
      )}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
