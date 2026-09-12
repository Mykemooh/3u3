'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function BookingStatusActions({
  bookingId,
  status,
  completeLabel = 'Mark completed',
}: {
  bookingId: string;
  status: string;
  completeLabel?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<'complete' | 'cancel' | null>(null);
  const [error, setError] = useState('');

  async function setStatus(next: 'COMPLETED' | 'CANCELLED') {
    setBusy(next === 'COMPLETED' ? 'complete' : 'cancel');
    setError('');
    const res = await fetch(`/api/admin/bookings/${bookingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    });
    setBusy(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Could not update.');
      return;
    }
    router.refresh();
  }

  if (status === 'COMPLETED' || status === 'CANCELLED') {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => setStatus('COMPLETED')}
        disabled={busy !== null}
        className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 transition hover:border-emerald-400 disabled:opacity-50"
      >
        {busy === 'complete' ? '…' : completeLabel}
      </button>
      <button
        onClick={() => setStatus('CANCELLED')}
        disabled={busy !== null}
        className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600 transition hover:border-red-400 disabled:opacity-50"
      >
        {busy === 'cancel' ? '…' : 'Cancel'}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
