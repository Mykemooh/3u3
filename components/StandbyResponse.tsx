'use client';

import { useState } from 'react';

type Status = 'WAITING' | 'OFFERED' | 'BOOKED' | 'EXPIRED' | 'CANCELLED';

export default function StandbyResponse({ token, initialStatus, expired }: { token: string; initialStatus: Status; expired: boolean }) {
  const [status, setStatus] = useState<Status>(expired ? 'EXPIRED' : initialStatus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function respond(action: 'accept' | 'decline') {
    setBusy(true);
    setError('');
    const res = await fetch(`/api/standby/${token}/${action}`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || 'Something went wrong.');
      if (data.error?.includes('expired')) setStatus('EXPIRED');
      return;
    }
    setStatus(action === 'accept' ? 'BOOKED' : 'CANCELLED');
  }

  if (status === 'BOOKED') {
    return (
      <div className="mt-6">
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          Booked! You're all set — see it in your account.
        </p>
        <a href="/account" className="btn-primary mt-4 w-full">
          Go to your account
        </a>
      </div>
    );
  }

  if (status === 'EXPIRED') {
    return (
      <p className="mt-6 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
        This offer has expired — we've offered the spot to the next person waiting. Keep an eye out, or book any
        open time from your account.
      </p>
    );
  }

  if (status === 'CANCELLED') {
    return (
      <p className="mt-6 rounded-xl bg-surface px-4 py-3 text-sm text-slate">
        No problem — we'll keep watching for another opening on this day.
      </p>
    );
  }

  return (
    <div className="mt-6">
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      <button type="button" onClick={() => respond('accept')} disabled={busy} className="btn-primary w-full">
        {busy ? 'One moment…' : 'Claim this spot'}
      </button>
      <button
        type="button"
        onClick={() => respond('decline')}
        disabled={busy}
        className="mt-3 w-full text-sm text-muted hover:text-ink"
      >
        No thanks
      </button>
    </div>
  );
}
