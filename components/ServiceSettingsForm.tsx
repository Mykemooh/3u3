'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ServiceSettingsForm({
  serviceId,
  initial,
}: {
  serviceId: string;
  initial: { defaultDurationMinutes: number; recurringEligible: boolean };
}) {
  const router = useRouter();
  const [durationMinutes, setDurationMinutes] = useState(initial.defaultDurationMinutes);
  const [recurringEligible, setRecurringEligible] = useState(initial.recurringEligible);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('saving');
    const res = await fetch(`/api/admin/services/${serviceId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ defaultDurationMinutes: durationMinutes, recurringEligible }),
    });
    if (res.ok) {
      setStatus('saved');
      router.refresh();
    } else {
      setStatus('error');
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-4">
      <div>
        <label className="label">Duration (minutes)</label>
        <input
          className="input w-32"
          type="number"
          min={30}
          step={30}
          value={durationMinutes}
          onChange={(e) => setDurationMinutes(Number(e.target.value))}
        />
      </div>
      <label className="flex items-center gap-2 pb-3 text-sm font-medium text-ink/70">
        <input
          type="checkbox"
          checked={recurringEligible}
          onChange={(e) => setRecurringEligible(e.target.checked)}
          className="h-4 w-4 accent-gold"
        />
        Recurring eligible
      </label>
      <button type="submit" disabled={status === 'saving'} className="btn-primary">
        {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved ✓' : 'Save'}
      </button>
      {status === 'error' && <p className="text-sm text-red-600">Couldn't save.</p>}
    </form>
  );
}
