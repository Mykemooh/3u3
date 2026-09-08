'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

function minutesToHM(min: number) {
  return { h: Math.floor(min / 60), m: min % 60 };
}

export default function CrewSettingsForm({
  crewId,
  initial,
}: {
  crewId: string;
  initial: { workStartMinutes: number; workEndMinutes: number; homesPerDay: number; commuteBufferMinutes: number };
}) {
  const router = useRouter();
  const startHM = minutesToHM(initial.workStartMinutes);
  const endHM = minutesToHM(initial.workEndMinutes);
  const [start, setStart] = useState(`${String(startHM.h).padStart(2, '0')}:${String(startHM.m).padStart(2, '0')}`);
  const [end, setEnd] = useState(`${String(endHM.h).padStart(2, '0')}:${String(endHM.m).padStart(2, '0')}`);
  const [homesPerDay, setHomesPerDay] = useState(initial.homesPerDay);
  const [buffer, setBuffer] = useState(initial.commuteBufferMinutes);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('saving');
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    const res = await fetch('/api/admin/crew', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        crewId,
        workStartMinutes: sh * 60 + sm,
        workEndMinutes: eh * 60 + em,
        homesPerDay,
        commuteBufferMinutes: buffer,
      }),
    });
    if (res.ok) {
      setStatus('saved');
      router.refresh();
    } else {
      setStatus('error');
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Working hours start</label>
          <input type="time" className="input" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div>
          <label className="label">Working hours end</label>
          <input type="time" className="input" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Homes per crew per day</label>
          <input
            type="number"
            min={1}
            max={10}
            className="input"
            value={homesPerDay}
            onChange={(e) => setHomesPerDay(Number(e.target.value))}
          />
        </div>
        <div>
          <label className="label">Commute buffer (minutes)</label>
          <input
            type="number"
            min={0}
            max={180}
            step={5}
            className="input"
            value={buffer}
            onChange={(e) => setBuffer(Number(e.target.value))}
          />
        </div>
      </div>
      <button type="submit" disabled={status === 'saving'} className="btn-primary">
        {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved ✓' : 'Save schedule settings'}
      </button>
      {status === 'error' && <p className="text-sm text-red-600">Couldn't save — please try again.</p>}
    </form>
  );
}
