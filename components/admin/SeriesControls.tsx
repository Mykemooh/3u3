'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Visit = {
  id: string;
  slotStart: string;
  slotEnd: string;
  status: string;
  isSeriesException: boolean;
  jobStatus: string | null;
  jobId: string | null;
  seriesOccurrenceDate: string | null;
  crewId: string | null;
};
type Crew = { id: string; name: string };

async function post(url: string, body: unknown, method = 'POST') {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? 'Something went wrong.');
  return data;
}

const pretty = (s: string) => new Date(`${s.slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const time = (s: string) => {
  const [h, m] = s.slice(11, 16).split(':').map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};

export function SeriesStatusButtons({ seriesId, status }: { seriesId: string; status: 'ACTIVE' | 'PAUSED' | 'ENDED' }) {
  const router = useRouter();
  const [error, setError] = useState('');
  const act = async (action: 'pause' | 'resume' | 'end') => {
    if (action === 'end' && !confirm('End this recurring clean? Upcoming visits that haven’t started will be removed.')) return;
    try {
      await post(`/api/admin/series/${seriesId}`, { action }, 'PATCH');
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  if (status === 'ENDED') return <span className="pill bg-surface text-muted">Ended</span>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === 'ACTIVE' ? (
        <button className="btn-secondary btn-sm" onClick={() => act('pause')}>Pause</button>
      ) : (
        <button className="btn-primary btn-sm" onClick={() => act('resume')}>Resume</button>
      )}
      <button className="rounded-full px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50" onClick={() => act('end')}>End series</button>
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}

export function SeriesVisits({ seriesId, visits, crews, defaults }: {
  seriesId: string;
  visits: Visit[];
  crews: Crew[];
  defaults: { startMinutes: number; durationMinutes: number; crewId: string; priceCents: number | null };
}) {
  const router = useRouter();
  const [open, setOpen] = useState<{ id: string; mode: 'move' | 'future' } | null>(null);
  const [error, setError] = useState('');
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = visits.filter((v) => v.slotStart.slice(0, 10) >= today);
  const past = visits.filter((v) => v.slotStart.slice(0, 10) < today).slice(-5);

  const run = async (fn: () => Promise<unknown>) => {
    setError('');
    try {
      await fn();
      setOpen(null);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const row = (v: Visit) => {
    const editable = v.status !== 'CANCELLED' && v.status !== 'COMPLETED' && (v.jobStatus === null || v.jobStatus === 'PENDING');
    return (
      <li key={v.id} className="py-3">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-3">
            <span className={`font-semibold ${v.status === 'CANCELLED' ? 'text-muted line-through' : 'text-ink'}`}>{pretty(v.slotStart)}</span>
            <span className="text-slate">{time(v.slotStart)} – {time(v.slotEnd)}</span>
            {v.isSeriesException && v.status !== 'CANCELLED' && <span className="pill bg-gold/10 text-bronze">Moved</span>}
            {v.status === 'CANCELLED' && <span className="pill bg-surface text-muted">Skipped</span>}
            {v.jobStatus === 'COMPLETE' && <span className="pill bg-green-light text-green">Done</span>}
          </div>
          {editable && (
            <div className="flex gap-3">
              <button className="font-semibold text-bronze hover:underline" onClick={() => setOpen({ id: v.id, mode: 'move' })}>Move</button>
              <button className="text-slate hover:text-ink" onClick={() => run(() => post(`/api/admin/series/visits/${v.id}`, { action: 'skip' }))}>Skip</button>
              <button className="text-slate hover:text-ink" onClick={() => setOpen({ id: v.id, mode: 'future' })}>Change this & after</button>
            </div>
          )}
        </div>
        {open?.id === v.id && open.mode === 'move' && (
          <MoveForm visit={v} crews={crews} onCancel={() => setOpen(null)} onSave={(body) => run(() => post(`/api/admin/series/visits/${v.id}`, { action: 'move', ...body }))} />
        )}
        {open?.id === v.id && open.mode === 'future' && (
          <FutureForm
            fromDate={v.seriesOccurrenceDate ?? v.slotStart.slice(0, 10)}
            crews={crews}
            defaults={defaults}
            onCancel={() => setOpen(null)}
            onSave={(body) => run(() => post(`/api/admin/series/${seriesId}/future`, body))}
          />
        )}
      </li>
    );
  };

  return (
    <div className="space-y-6">
      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      <section className="card">
        <h3 className="font-semibold text-ink">Upcoming visits</h3>
        <p className="text-xs text-muted">Moving or skipping a visit changes only that visit.</p>
        {upcoming.length === 0 ? <p className="mt-3 text-sm text-muted">No upcoming visits.</p> : <ul className="mt-2 divide-y divide-line">{upcoming.map(row)}</ul>}
      </section>
      {past.length > 0 && (
        <section className="card">
          <h3 className="font-semibold text-ink">Recent visits</h3>
          <ul className="mt-2 divide-y divide-line">{past.map(row)}</ul>
        </section>
      )}
    </div>
  );
}

function MoveForm({ visit, crews, onSave, onCancel }: { visit: Visit; crews: Crew[]; onSave: (b: Record<string, string>) => void; onCancel: () => void }) {
  const [date, setDate] = useState(visit.slotStart.slice(0, 10));
  const [start, setStart] = useState(visit.slotStart.slice(11, 16));
  const [end, setEnd] = useState(visit.slotEnd.slice(11, 16));
  const [crewId, setCrewId] = useState(visit.crewId ?? crews[0]?.id ?? '');
  return (
    <form
      className="mt-3 grid gap-3 rounded-xl bg-surface p-4 sm:grid-cols-5"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ date, startTime: start, endTime: end, crewId });
      }}
    >
      <input type="date" className="input !py-2" value={date} onChange={(e) => setDate(e.target.value)} aria-label="New date" />
      <input type="time" className="input !py-2" value={start} onChange={(e) => setStart(e.target.value)} aria-label="Start" />
      <input type="time" className="input !py-2" value={end} onChange={(e) => setEnd(e.target.value)} aria-label="End" />
      <select className="input !py-2" value={crewId} onChange={(e) => setCrewId(e.target.value)} aria-label="Team">
        {crews.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <div className="flex gap-2">
        <button className="btn-primary btn-sm">Move</button>
        <button type="button" className="text-sm text-muted" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function FutureForm({
  fromDate,
  crews,
  defaults,
  onSave,
  onCancel,
}: {
  fromDate: string;
  crews: Crew[];
  defaults: { startMinutes: number; durationMinutes: number; crewId: string; priceCents: number | null };
  onSave: (b: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const toT = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const [start, setStart] = useState(toT(defaults.startMinutes));
  const [duration, setDuration] = useState(defaults.durationMinutes);
  const [crewId, setCrewId] = useState(defaults.crewId);
  const [price, setPrice] = useState(defaults.priceCents != null ? (defaults.priceCents / 100).toFixed(2) : '');
  const [newStart, setNewStart] = useState(fromDate);
  return (
    <form
      className="mt-3 space-y-3 rounded-xl bg-surface p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const [h, m] = start.split(':').map(Number);
        onSave({
          fromDate,
          startMinutes: h * 60 + m,
          durationMinutes: duration,
          crewId,
          priceCents: price ? Math.round(Number(price) * 100) : null,
          ...(newStart !== fromDate ? { newStartDate: newStart } : {}),
        });
      }}
    >
      <p className="text-sm text-slate">Changes this visit and every one after it. Earlier visits stay exactly as they were.</p>
      <div className="grid gap-3 sm:grid-cols-5">
        <label className="text-xs text-muted">Start<input type="time" className="input !py-2" value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <label className="text-xs text-muted">Minutes<input type="number" min={15} step={15} className="input !py-2" value={duration} onChange={(e) => setDuration(Number(e.target.value))} /></label>
        <label className="text-xs text-muted">Team
          <select className="input !py-2" value={crewId} onChange={(e) => setCrewId(e.target.value)}>
            {crews.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="text-xs text-muted">Price ($)<input type="number" step="0.01" className="input !py-2" value={price} onChange={(e) => setPrice(e.target.value)} /></label>
        <label className="text-xs text-muted">New day (optional)<input type="date" className="input !py-2" value={newStart} onChange={(e) => setNewStart(e.target.value)} /></label>
      </div>
      <div className="flex gap-2">
        <button className="btn-primary btn-sm">Apply to this & after</button>
        <button type="button" className="text-sm text-muted" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
