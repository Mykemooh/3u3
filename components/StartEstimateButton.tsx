'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * The bridge from "we did the walkthrough" to "here's your price" — the
 * step that used to happen off-system. Creates (or reopens) the draft
 * estimate for this lead and drops the admin straight into the editor.
 */
export default function StartEstimateButton({
  clientId,
  serviceTypeId,
  quoteVisitBookingId,
  label = 'Build estimate →',
}: {
  clientId: string;
  serviceTypeId?: string;
  quoteVisitBookingId?: string;
  label?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function start() {
    // The lead has to have said which service they want before we can price
    // it — that's what the approved rate gets attached to.
    if (!serviceTypeId) {
      setError('Pick a service for this lead first (on their client page).');
      return;
    }
    setBusy(true);
    setError('');
    const res = await fetch('/api/admin/estimates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, serviceTypeId, quoteVisitBookingId }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || 'Could not start an estimate.');
      return;
    }
    router.push(`/admin/estimates/${data.quoteId}`);
  }

  return (
    <div className="text-right">
      <button
        type="button"
        onClick={start}
        disabled={busy}
        className="text-sm font-semibold text-bronze hover:underline disabled:opacity-50"
      >
        {busy ? 'Opening…' : label}
      </button>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
