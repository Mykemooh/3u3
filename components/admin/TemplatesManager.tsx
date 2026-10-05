'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Template = {
  id: string;
  name: string;
  serviceTypeId: string | null;
  durationMinutes: number;
  arrivalWindowMinutes: number;
  pattern: string;
  weekdays: string | null;
  preferredStartMinutes: number;
  defaultCrewId: string | null;
  teamSize: number | null;
  notes: string | null;
  color: string | null;
};
type Option = { id: string; name: string };

const PATTERNS: [string, string][] = [
  ['ONE_TIME', 'One time'],
  ['WEEKLY', 'Every week'],
  ['EVERY_2_WEEKS', 'Every 2 weeks'],
  ['EVERY_4_WEEKS', 'Every 4 weeks'],
  ['MONTHLY_NTH_WEEKDAY', 'Monthly'],
  ['CUSTOM_WEEKDAYS', 'Set days each week'],
];
const COLORS = ['#016AEE', '#0157C4', '#18AA9D', '#2DBD91', '#F59E0B', '#B45309', '#041730', '#9333EA'];
const label12 = (m: number) => {
  const h = Math.floor(m / 60);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m % 60).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};
const toT = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? 'Something went wrong.');
  return data;
}

export default function TemplatesManager({ templates, services, crews }: { templates: Template[]; services: Option[]; crews: Option[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Template | 'new' | null>(null);
  const [error, setError] = useState('');
  const run = async (fn: () => Promise<unknown>) => {
    setError('');
    try {
      await fn();
      setEditing(null);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {templates.map((t) => (
          <div key={t.id} className="relative overflow-hidden rounded-2xl border border-line bg-white p-5">
            <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: t.color ?? '#016AEE' }} aria-hidden="true" />
            <h3 className="font-semibold text-ink">{t.name}</h3>
            <p className="mt-1 text-sm text-slate">
              {services.find((s) => s.id === t.serviceTypeId)?.name ?? 'Any service'} · {Math.floor(t.durationMinutes / 60)}h{t.durationMinutes % 60 ? ` ${t.durationMinutes % 60}m` : ''}
            </p>
            <p className="text-sm text-slate">
              {PATTERNS.find((p) => p[0] === t.pattern)?.[1]} · starts {label12(t.preferredStartMinutes)}
              {t.arrivalWindowMinutes ? ` (±${t.arrivalWindowMinutes / 2} min window)` : ''}
            </p>
            {t.teamSize && <p className="text-xs text-muted">{t.teamSize} cleaners</p>}
            {t.notes && <p className="mt-2 line-clamp-2 text-xs text-muted">{t.notes}</p>}
            <div className="mt-4 flex gap-4 text-sm">
              <button className="font-semibold text-bronze hover:underline" onClick={() => setEditing(t)}>Edit</button>
              <button className="text-slate hover:text-ink" onClick={() => run(() => send(`/api/admin/templates/${t.id}`, 'POST', {}))}>Copy</button>
              <button className="text-slate hover:text-red-600" onClick={() => confirm(`Delete "${t.name}"?`) && run(() => send(`/api/admin/templates/${t.id}`, 'DELETE'))}>Delete</button>
            </div>
          </div>
        ))}
      </div>
      {editing ? (
        <TemplateForm
          initial={editing === 'new' ? null : editing}
          services={services}
          crews={crews}
          onCancel={() => setEditing(null)}
          onSave={(body) => run(() => (editing === 'new' ? send('/api/admin/templates', 'POST', body) : send(`/api/admin/templates/${editing.id}`, 'PATCH', body)))}
        />
      ) : (
        <button className="btn-primary btn-sm" onClick={() => setEditing('new')}>New template</button>
      )}
    </div>
  );
}

function TemplateForm({ initial, services, crews, onSave, onCancel }: { initial: Template | null; services: Option[]; crews: Option[]; onSave: (b: unknown) => void; onCancel: () => void }) {
  const [f, setF] = useState<{
    name: string; serviceTypeId: string | null; durationMinutes: number; arrivalWindowMinutes: number; pattern: string;
    weekdays: string | null; preferredStartMinutes: number; defaultCrewId: string | null; teamSize: number | null; notes: string | null; color: string | null;
  }>({
    name: initial?.name ?? '',
    serviceTypeId: initial?.serviceTypeId ?? services[0]?.id ?? null,
    durationMinutes: initial?.durationMinutes ?? 150,
    arrivalWindowMinutes: initial?.arrivalWindowMinutes ?? 60,
    pattern: initial?.pattern ?? 'ONE_TIME',
    weekdays: initial?.weekdays ?? null,
    preferredStartMinutes: initial?.preferredStartMinutes ?? 540,
    defaultCrewId: initial?.defaultCrewId ?? null,
    teamSize: initial?.teamSize ?? 2,
    notes: initial?.notes ?? '',
    color: initial?.color ?? COLORS[0],
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  return (
    <form className="rounded-2xl border border-gold bg-white p-5" onSubmit={(e) => { e.preventDefault(); onSave(f); }}>
      <h3 className="font-semibold text-ink">{initial ? 'Edit template' : 'New template'}</h3>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <label className="md:col-span-2"><span className="label">Name</span><input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} required /></label>
        <label><span className="label">Service</span>
          <select className="input" value={f.serviceTypeId ?? ''} onChange={(e) => set('serviceTypeId', e.target.value || null)}>
            {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label><span className="label">Length (minutes)</span><input type="number" min={15} step={15} className="input" value={f.durationMinutes} onChange={(e) => set('durationMinutes', Number(e.target.value))} /></label>
        <label><span className="label">Preferred start</span><input type="time" className="input" value={toT(f.preferredStartMinutes)} onChange={(e) => { const [h, m] = e.target.value.split(':').map(Number); set('preferredStartMinutes', h * 60 + m); }} /></label>
        <label><span className="label">Arrival window (minutes)</span><input type="number" min={0} step={15} className="input" value={f.arrivalWindowMinutes} onChange={(e) => set('arrivalWindowMinutes', Number(e.target.value))} /></label>
        <label><span className="label">Repeats</span>
          <select className="input" value={f.pattern} onChange={(e) => set('pattern', e.target.value)}>
            {PATTERNS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        <label><span className="label">Default team</span>
          <select className="input" value={f.defaultCrewId ?? ''} onChange={(e) => set('defaultCrewId', e.target.value || null)}>
            <option value="">Any</option>
            {crews.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label><span className="label">Cleaners</span><input type="number" min={1} max={20} className="input" value={f.teamSize ?? ''} onChange={(e) => set('teamSize', Number(e.target.value) || null)} /></label>
        <label className="md:col-span-3"><span className="label">Notes for the team</span><textarea className="input min-h-[70px]" value={f.notes ?? ''} onChange={(e) => set('notes', e.target.value)} /></label>
        <div className="md:col-span-3">
          <span className="label">Colour on the calendar</span>
          <div className="flex gap-2">
            {COLORS.map((c) => (
              <button type="button" key={c} aria-label={`Colour ${c}`} aria-pressed={f.color === c} onClick={() => set('color', c)} className={`h-8 w-8 rounded-full ring-offset-2 ${f.color === c ? 'ring-2 ring-ink' : ''}`} style={{ background: c }} />
            ))}
          </div>
        </div>
      </div>
      <div className="mt-5 flex gap-3">
        <button className="btn-primary btn-sm">Save template</button>
        <button type="button" className="btn-secondary btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
