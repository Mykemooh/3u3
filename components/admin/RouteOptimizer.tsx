'use client';

import { useState } from 'react';

type Team = { id: string; name: string; hasHomeBase: boolean };
type RouteStop = { bookingId: string; label: string; slotStart: string; slotEnd: string; order: number };
type Route = {
  stops: RouteStop[];
  totalMiles: number;
  totalMinutes: number;
  currentTotalMiles: number;
  currentTotalMinutes: number;
  savingsMiles: number;
  savingsMinutes: number;
  unroutedCount: number;
};

export default function RouteOptimizer({ teams, defaultDate }: { teams: Team[]; defaultDate: string }) {
  const [crewId, setCrewId] = useState(teams[0]?.id ?? '');
  const [date, setDate] = useState(defaultDate);
  const [route, setRoute] = useState<Route | null | undefined>(undefined); // undefined = not run yet
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const team = teams.find((t) => t.id === crewId);

  async function optimize() {
    setBusy(true);
    setError('');
    setRoute(undefined);
    const res = await fetch('/api/admin/routes/optimize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ crewId, date }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error || 'Could not optimize that route.');
    setRoute(data.route);
  }

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Team</label>
          <select className="input" value={crewId} onChange={(e) => setCrewId(e.target.value)}>
            {teams.map((t) => (
              <option key={t.id} value={t.id} disabled={!t.hasHomeBase}>
                {t.name} {!t.hasHomeBase ? '(no home base set)' : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Date</label>
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <button onClick={optimize} disabled={busy || !team?.hasHomeBase} className="btn-primary">
          {busy ? 'Optimizing…' : 'Optimize route'}
        </button>
      </div>

      {error && <p className="card text-sm text-red-600">{error}</p>}

      {route === null && (
        <p className="card text-sm text-muted">Fewer than two jobs that day (or none geocodable) — nothing to optimize.</p>
      )}

      {route && (
        <div className="card space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-2xl font-bold text-ink">
                {route.totalMiles} mi · {route.totalMinutes} min
              </p>
              {route.savingsMiles > 0 || route.savingsMinutes > 0 ? (
                <p className="text-sm font-semibold text-green">
                  Saves {route.savingsMiles} mi / {route.savingsMinutes} min vs. the booked order ({route.currentTotalMiles} mi · {route.currentTotalMinutes} min)
                </p>
              ) : (
                <p className="text-sm text-muted">Already the most efficient order for this day.</p>
              )}
            </div>
            {route.unroutedCount > 0 && (
              <p className="text-xs text-amber-700">
                {route.unroutedCount} job{route.unroutedCount === 1 ? '' : 's'} couldn't be located and {route.unroutedCount === 1 ? "isn't" : "aren't"} included above.
              </p>
            )}
          </div>

          <ol className="space-y-2">
            {route.stops.map((stop) => (
              <li key={stop.bookingId} className="flex items-center gap-3 rounded-xl border border-line px-4 py-3 text-sm">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gold/15 text-xs font-bold text-bronze">
                  {stop.order}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-ink">{stop.label}</p>
                  <p className="text-muted">
                    Booked {stop.slotStart.slice(11, 16)}–{stop.slotEnd.slice(11, 16)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
          <p className="text-xs text-muted">
            This is a suggested visiting order, not a schedule change — move jobs on the Schedule board if you want to
            act on it.
          </p>
        </div>
      )}
    </div>
  );
}
