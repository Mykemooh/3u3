'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Switch from '@/components/ui/Switch';

export default function ServiceSettingsForm({
  serviceId,
  initial,
}: {
  serviceId: string;
  initial: { defaultDurationMinutes: number; recurringEligible: boolean; offered: boolean };
}) {
  const router = useRouter();
  const [durationMinutes, setDurationMinutes] = useState(initial.defaultDurationMinutes);
  const [recurringEligible, setRecurringEligible] = useState(initial.recurringEligible);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [offered, setOffered] = useState(initial.offered);

  async function toggleOffered(next: boolean) {
    setOffered(next);
    const res = await fetch(`/api/admin/services/${serviceId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ offered: next }),
    });
    if (!res.ok) setOffered(!next);
    router.refresh();
  }

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
    <div className="space-y-4">
    <div className="flex items-center justify-between gap-4 rounded-xl bg-surface px-4 py-3">
      <div>
        <p className="text-sm font-semibold text-ink">{offered ? 'Offered' : 'Not offered'}</p>
        <p className="text-xs text-slate">{offered ? 'Clients can request it and you can quote and schedule it.' : 'Hidden from the request form. Existing clients and history are kept.'}</p>
      </div>
      <Switch checked={offered} onChange={toggleOffered} label={offered ? 'Offered' : 'Not offered'} />
    </div>
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-4">
      <div>
        <label className="label">Duration (minutes)</label>
        <input
          className="input w-32"
          type="number"
          min={30}
          max={720}
          step={30}
          value={durationMinutes}
          onChange={(e) => setDurationMinutes(Number(e.target.value))}
        />
      </div>
      <label className="flex items-center gap-2 pb-3 text-sm font-medium text-slate">
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
    </div>
  );
}
