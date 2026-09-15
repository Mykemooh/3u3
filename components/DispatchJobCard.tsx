'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const JOB_STATUS_STYLE: Record<string, string> = {
  PENDING: 'bg-ink/5 text-ink/50',
  IN_PROGRESS: 'bg-amber-100 text-amber-700',
  COMPLETE: 'bg-emerald-100 text-emerald-700',
};

function timeLabel(slot: string) {
  const [h, m] = slot.split('T')[1].split(':').map(Number);
  const ampm = h >= 12 ? 'p' : 'a';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${ampm}` : `${h12}:${m.toString().padStart(2, '0')}${ampm}`;
}

/**
 * One job on the dispatch board. The crew dropdown is the actual dispatch
 * action — the server re-runs the no-double-booking check, so picking a
 * crew that's already busy comes back as a refusal rather than silently
 * stacking two jobs on one crew.
 */
export default function DispatchJobCard({
  bookingId,
  clientId,
  clientName,
  serviceName,
  slotStart,
  slotEnd,
  addressLine,
  jobStatus,
  crewId,
  crews,
}: {
  bookingId: string;
  clientId: string;
  clientName: string;
  serviceName: string;
  slotStart: string;
  slotEnd: string;
  addressLine?: string;
  jobStatus?: string;
  crewId: string | null;
  crews: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function move(nextCrewId: string) {
    if (!nextCrewId || nextCrewId === crewId) return;
    setBusy(true);
    setError('');
    const res = await fetch(`/api/admin/bookings/${bookingId}/crew`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ crewId: nextCrewId }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Could not move that job.');
      return;
    }
    router.refresh();
  }

  return (
    <div className={`rounded-xl border border-ink/10 bg-white p-2 text-xs ${busy ? 'opacity-50' : ''}`}>
      <div className="flex items-center justify-between gap-1">
        <span className="font-semibold text-ink">
          {timeLabel(slotStart)}–{timeLabel(slotEnd)}
        </span>
        {jobStatus && <span className={`pill ${JOB_STATUS_STYLE[jobStatus]} !px-2 !py-0.5`}>{jobStatus[0]}</span>}
      </div>
      <Link href={`/admin/clients/${clientId}`} className="mt-0.5 block font-medium text-ink hover:text-bronze">
        {clientName}
      </Link>
      <p className="text-ink/50">{serviceName}</p>
      {addressLine && <p className="truncate text-ink/40">{addressLine}</p>}

      {crews.length > 1 && (
        <select
          className="mt-1.5 w-full rounded-lg border border-ink/10 bg-cream px-1.5 py-1 text-xs text-ink/70 focus:border-gold focus:outline-none"
          value={crewId ?? ''}
          disabled={busy}
          onChange={(e) => move(e.target.value)}
          aria-label={`Crew for ${clientName}`}
        >
          {!crewId && <option value="">Unassigned</option>}
          {crews.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}
      {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
