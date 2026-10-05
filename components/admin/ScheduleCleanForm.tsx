'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type Client = {
  id: string;
  name: string;
  phone: string | null;
  zip: string | null;
  address: string | null;
  rates: Record<string, number>;
  /** Phase or per-visit prices from the client's approved quotes (post-construction, commercial). */
  quoted?: { serviceTypeId: string; label: string; amountCents: number }[];
};
type Service = { id: string; name: string; defaultDurationMinutes: number };
type Crew = { id: string; name: string };
type Template = {
  id: string;
  name: string;
  serviceTypeId: string | null;
  durationMinutes: number;
  pattern: Pattern | 'ONE_TIME';
  weekdays: string | null;
  preferredStartMinutes: number;
  defaultCrewId: string | null;
  notes: string | null;
  color: string | null;
};
type Pattern = 'WEEKLY' | 'EVERY_2_WEEKS' | 'EVERY_4_WEEKS' | 'MONTHLY_NTH_WEEKDAY' | 'CUSTOM_WEEKDAYS';
type Suggestion = { crewId: string; crewName: string; date: string; startMinutes: number; label: string; reasons: string[] };

const REPEAT: { key: Pattern | 'ONE_TIME'; label: string }[] = [
  { key: 'ONE_TIME', label: 'One time' },
  { key: 'WEEKLY', label: 'Every week' },
  { key: 'EVERY_2_WEEKS', label: 'Every 2 weeks' },
  { key: 'EVERY_4_WEEKS', label: 'Every 4 weeks' },
  { key: 'MONTHLY_NTH_WEEKDAY', label: 'Monthly' },
  { key: 'CUSTOM_WEEKDAYS', label: 'Set days' },
];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ORD = ['', 'first', 'second', 'third', 'fourth'];

const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const fromTime = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
};
const label12 = (m: number) => {
  const h = Math.floor(m / 60);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m % 60).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};
const dayName = (iso: string) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long' }) : '');
const prettyDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

export default function ScheduleCleanForm({
  clients,
  services,
  crews,
  templates,
  defaultDate,
  initialClientId,
}: {
  clients: Client[];
  services: Service[];
  crews: Crew[];
  templates: Template[];
  defaultDate: string;
  initialClientId?: string;
}) {
  const router = useRouter();
  const [clientId, setClientId] = useState(initialClientId ?? '');
  const [search, setSearch] = useState('');
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [serviceTypeId, setServiceTypeId] = useState(services[0]?.id ?? '');
  const [duration, setDuration] = useState(services[0]?.defaultDurationMinutes ?? 150);
  const [repeat, setRepeat] = useState<Pattern | 'ONE_TIME'>('ONE_TIME');
  const [weekdays, setWeekdays] = useState<Set<number>>(new Set());
  const [date, setDate] = useState(defaultDate);
  const [start, setStart] = useState(9 * 60);
  const [crewId, setCrewId] = useState(crews[0]?.id ?? '');
  const [price, setPrice] = useState('');
  const [endDate, setEndDate] = useState('');
  const [skipHolidays, setSkipHolidays] = useState(true);
  const [notes, setNotes] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [finding, setFinding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ message: string; conflicts: string[]; href: string } | null>(null);

  const client = clients.find((c) => c.id === clientId);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients.slice(0, 8);
    return clients.filter((c) => c.name.toLowerCase().includes(q) || (c.phone ?? '').includes(q)).slice(0, 8);
  }, [clients, search]);

  const pickClient = (c: Client) => {
    setClientId(c.id);
    setSearch('');
    const rate = c.rates[serviceTypeId];
    if (rate != null) setPrice((rate / 100).toFixed(2));
  };

  const pickService = (id: string) => {
    setServiceTypeId(id);
    const svc = services.find((s) => s.id === id);
    if (svc && !templateId) setDuration(svc.defaultDurationMinutes);
    const rate = client?.rates[id];
    setPrice(rate != null ? (rate / 100).toFixed(2) : '');
  };

  const applyTemplate = (t: Template) => {
    setTemplateId(t.id);
    if (t.serviceTypeId) {
      setServiceTypeId(t.serviceTypeId);
      const rate = client?.rates[t.serviceTypeId];
      setPrice(rate != null ? (rate / 100).toFixed(2) : '');
    }
    setDuration(t.durationMinutes);
    setRepeat(t.pattern);
    setWeekdays(new Set((t.weekdays ?? '').split(',').filter(Boolean).map(Number)));
    setStart(t.preferredStartMinutes);
    if (t.defaultCrewId) setCrewId(t.defaultCrewId);
    if (t.notes) setNotes(t.notes);
  };

  async function findTime() {
    setFinding(true);
    setSuggestions(null);
    const params = new URLSearchParams({ duration: String(duration), pref: String(start) });
    if (client?.zip) params.set('zip', client.zip);
    const res = await fetch(`/api/admin/find-a-time?${params}`);
    const body = await res.json().catch(() => ({}));
    setFinding(false);
    setSuggestions(res.ok ? body.suggestions : []);
  }

  const nth = Math.min(4, Math.ceil(Number(date.slice(8, 10)) / 7));
  const summary =
    repeat === 'ONE_TIME'
      ? `Once, on ${date ? prettyDate(date) : '—'} at ${label12(start)}`
      : repeat === 'WEEKLY'
        ? `Every ${dayName(date)} at ${label12(start)}`
        : repeat === 'EVERY_2_WEEKS'
          ? `Every other ${dayName(date)} at ${label12(start)}`
          : repeat === 'EVERY_4_WEEKS'
            ? `Every 4 weeks on ${dayName(date)} at ${label12(start)}`
            : repeat === 'MONTHLY_NTH_WEEKDAY'
              ? `The ${ORD[nth]} ${dayName(date)} of each month at ${label12(start)}`
              : `Every ${Array.from(weekdays).sort().map((d) => DAYS[d]).join(', ') || '— pick days —'} at ${label12(start)}`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId) return setError('Pick a client.');
    setBusy(true);
    setError('');
    const res = await fetch('/api/admin/series', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId,
        serviceTypeId,
        crewId,
        pattern: repeat,
        startDate: date,
        endDate: repeat !== 'ONE_TIME' && endDate ? endDate : null,
        weekdays: repeat === 'CUSTOM_WEEKDAYS' ? Array.from(weekdays).sort().join(',') : null,
        startMinutes: start,
        durationMinutes: duration,
        priceCents: price ? Math.round(Number(price) * 100) : null,
        templateId,
        notes: notes || null,
        skipHolidays,
      }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(body.error ?? 'Could not schedule that.');
    if (body.seriesId) {
      setResult({
        message: `Recurring clean set up — ${body.created} visit${body.created === 1 ? '' : 's'} added to the calendar.`,
        conflicts: body.conflicts ?? [],
        href: `/admin/series/${body.seriesId}`,
      });
    } else {
      setResult({ message: 'Clean scheduled and the client has been sent a confirmation.', conflicts: [], href: '/admin/schedule' });
    }
    router.refresh();
  }

  if (result) {
    return (
      <div className="card max-w-xl">
        <h3 className="text-lg font-bold text-ink">{result.message}</h3>
        {result.conflicts.length > 0 && (
          <div className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            These dates clash with something already on that team's calendar and were left off:{' '}
            {result.conflicts.map(prettyDate).join(', ')}. Open the series to schedule them with another team.
          </div>
        )}
        <div className="mt-5 flex gap-3">
          <a href={result.href} className="btn-primary btn-sm">Open it</a>
          <button className="btn-secondary btn-sm" onClick={() => { setResult(null); setClientId(''); setTemplateId(null); }}>
            Schedule another
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        <section className="card">
          <h3 className="mb-3 font-semibold text-ink">1. Client</h3>
          {client ? (
            <div className="flex items-center justify-between gap-3 rounded-xl bg-surface px-4 py-3">
              <div>
                <p className="font-semibold text-ink">{client.name}</p>
                <p className="text-xs text-muted">{client.address ?? 'No address on file'}{client.phone ? ` · ${client.phone}` : ''}</p>
              </div>
              <button type="button" className="text-sm font-semibold text-bronze" onClick={() => setClientId('')}>Change</button>
            </div>
          ) : (
            <>
              <input className="input" placeholder="Search by name or phone" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
              <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
                {filtered.map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => pickClient(c)} className="flex w-full justify-between gap-3 px-4 py-2.5 text-left text-sm hover:bg-surface">
                      <span className="font-semibold text-ink">{c.name}</span>
                      <span className="text-muted">{c.address ?? c.phone ?? ''}</span>
                    </button>
                  </li>
                ))}
                {filtered.length === 0 && <li className="px-4 py-3 text-sm text-muted">No client matches. Add them under Clients first.</li>}
              </ul>
            </>
          )}
        </section>

        <section className="card">
          <h3 className="mb-1 font-semibold text-ink">2. What kind of clean</h3>
          <p className="mb-3 text-sm text-muted">Pick a template to fill everything in, or set it up below.</p>
          <div className="flex flex-wrap gap-2">
            {templates.map((t) => (
              <button
                type="button"
                key={t.id}
                onClick={() => applyTemplate(t)}
                className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold transition ${templateId === t.id ? 'border-gold bg-gold/10 text-bronze' : 'border-line text-slate hover:border-gold'}`}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: t.color ?? '#016AEE' }} />
                {t.name}
              </button>
            ))}
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-1">
              <label className="label" htmlFor="svc">Service</label>
              <select id="svc" className="input" value={serviceTypeId} onChange={(e) => pickService(e.target.value)}>
                {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="len">Length (minutes)</label>
              <input id="len" type="number" min={15} step={15} className="input" value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
            </div>
            <div>
              <label className="label" htmlFor="price">Price per visit ($)</label>
              <input id="price" type="number" min={0} step="0.01" className="input" placeholder="Agreed rate" value={price} onChange={(e) => setPrice(e.target.value)} />
              {(client?.quoted ?? []).filter((q) => q.serviceTypeId === serviceTypeId).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {client!.quoted!
                    .filter((q) => q.serviceTypeId === serviceTypeId)
                    .map((q) => (
                      <button
                        key={q.label}
                        type="button"
                        className="pill bg-gold/10 text-gold hover:bg-gold/20"
                        onClick={() => setPrice((q.amountCents / 100).toFixed(2))}
                        title="From the approved quote"
                      >
                        {q.label} ${(q.amountCents / 100).toFixed(2)}
                      </button>
                    ))}
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="card">
          <h3 className="mb-3 font-semibold text-ink">3. When</h3>
          <div className="flex flex-wrap gap-2">
            {REPEAT.map((r) => (
              <button
                type="button"
                key={r.key}
                onClick={() => setRepeat(r.key)}
                className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ${repeat === r.key ? 'bg-ink text-white' : 'bg-surface text-slate hover:text-ink'}`}
              >
                {r.label}
              </button>
            ))}
          </div>
          {repeat === 'CUSTOM_WEEKDAYS' && (
            <div className="mt-3 flex gap-1.5">
              {DAYS.map((d, i) => (
                <button
                  type="button"
                  key={d}
                  aria-pressed={weekdays.has(i)}
                  onClick={() => {
                    const next = new Set(weekdays);
                    if (next.has(i)) next.delete(i);
                    else next.add(i);
                    setWeekdays(next);
                  }}
                  className={`h-10 w-12 rounded-xl text-sm font-semibold ${weekdays.has(i) ? 'bg-gold text-white' : 'bg-surface text-slate'}`}
                >
                  {d}
                </button>
              ))}
            </div>
          )}
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="date">{repeat === 'ONE_TIME' ? 'Date' : 'First visit'}</label>
              <input id="date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div>
              <label className="label" htmlFor="start">Start time</label>
              <input id="start" type="time" step={900} className="input" value={toTime(start)} onChange={(e) => setStart(fromTime(e.target.value))} required />
            </div>
            <div>
              <label className="label" htmlFor="crew">Team</label>
              <select id="crew" className="input" value={crewId} onChange={(e) => setCrewId(e.target.value)}>
                {crews.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-dashed border-line p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate">Not sure when? Find open times that keep routes tight.</p>
              <button type="button" onClick={findTime} className="btn-secondary btn-sm" disabled={finding}>
                {finding ? 'Looking…' : 'Find a time'}
              </button>
            </div>
            {suggestions && (
              suggestions.length === 0 ? (
                <p className="mt-3 text-sm text-muted">No open times in the next two weeks for a clean this long.</p>
              ) : (
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  {suggestions.map((s, i) => (
                    <li key={i}>
                      <button
                        type="button"
                        onClick={() => { setDate(s.date); setStart(s.startMinutes); setCrewId(s.crewId); setSuggestions(null); }}
                        className="w-full rounded-xl border border-line p-3 text-left text-sm hover:border-gold"
                      >
                        <span className="font-semibold text-ink">{prettyDate(s.date)} · {s.label}</span>
                        <span className="block text-xs text-muted">{s.crewName}{s.reasons.length ? ` — ${s.reasons[0]}` : ''}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )
            )}
          </div>

          {repeat !== 'ONE_TIME' && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="end">Ends (optional)</label>
                <input id="end" type="date" className="input" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
              <label className="flex items-center gap-2 self-end pb-3 text-sm text-slate">
                <input type="checkbox" checked={skipHolidays} onChange={(e) => setSkipHolidays(e.target.checked)} />
                Skip federal holidays
              </label>
            </div>
          )}
        </section>

        <section className="card">
          <label className="label" htmlFor="notes">Notes for the team (optional)</label>
          <textarea id="notes" className="input min-h-[90px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </section>
      </div>

      <aside className="lg:sticky lg:top-28 lg:self-start">
        <div className="card">
          <p className="eyebrow">Summary</p>
          <p className="mt-2 font-display text-lg font-bold text-ink">{client?.name ?? 'Pick a client'}</p>
          <p className="text-sm text-slate">{services.find((s) => s.id === serviceTypeId)?.name} · {Math.floor(duration / 60)}h{duration % 60 ? ` ${duration % 60}m` : ''}</p>
          <p className="mt-3 text-sm text-ink">{summary}</p>
          <p className="text-sm text-slate">{crews.find((c) => c.id === crewId)?.name}{price ? ` · $${Number(price).toFixed(2)} a visit` : ''}</p>
          {repeat !== 'ONE_TIME' && (
            <p className="mt-3 text-xs text-muted">Visits are added eight weeks ahead and kept topped up. Moving or skipping one never changes the others.</p>
          )}
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          <button className="btn-primary mt-5 w-full" disabled={busy || !clientId}>
            {busy ? 'Scheduling…' : repeat === 'ONE_TIME' ? 'Schedule clean' : 'Start recurring clean'}
          </button>
        </div>
      </aside>
    </form>
  );
}
