'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Switch from '@/components/ui/Switch';

type Def = {
  key: string;
  group: string;
  label: string;
  description: string;
  timing?: { unit: 'hours' | 'days'; direction: 'before' | 'after'; default: number; choices: number[] };
  text: { subject: string; body: string; vars: string[] } | null;
  designedEmail?: boolean;
};
type State = { key: string; enabled: boolean; offsetMinutes: number | null; subject: string | null; body: string | null; customized: boolean };

const SAMPLE: Record<string, string> = {
  firstName: 'Maria',
  service: 'Standard Cleaning',
  date: 'Thursday, Oct 9',
  time: '9:00 AM – 12:00 PM',
  when: 'in 3 days',
  link: 'https://…/account',
  amount: '$185.00',
  eta: ', arriving around 9:12 AM',
};

function render(t: string, company: string) {
  return t.replace(/\{(\w+)\}/g, (w, n: string) => (n === 'company' ? company : SAMPLE[n] ?? w));
}

function timingLabel(n: number, unit: 'hours' | 'days', direction: 'before' | 'after') {
  const u = unit === 'days' ? (n === 1 ? 'day' : 'days') : n === 1 ? 'hour' : 'hours';
  return `${n} ${u} ${direction}`;
}

export default function AutomationsManager({ defs, states, company, textingReady }: { defs: Def[]; states: Record<string, State>; company: string; textingReady: boolean }) {
  const groups = useMemo(() => Array.from(new Set(defs.map((d) => d.group))), [defs]);
  return (
    <div className="space-y-8">
      {groups.map((g) => (
        <section key={g}>
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">{g}</h3>
          <div className="space-y-3">
            {defs
              .filter((d) => d.group === g)
              .map((d) => (
                <AutomationCard key={d.key} def={d} initial={states[d.key]} company={company} textingReady={textingReady} />
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function AutomationCard({ def, initial, company, textingReady }: { def: Def; initial: State; company: string; textingReady: boolean }) {
  const router = useRouter();
  const [state, setState] = useState(initial);
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState(initial.subject ?? def.text?.subject ?? '');
  const [body, setBody] = useState(initial.body ?? def.text?.body ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const unit = def.timing?.unit ?? 'hours';
  const offset = state.offsetMinutes != null ? (unit === 'days' ? state.offsetMinutes / 1440 : state.offsetMinutes / 60) : def.timing?.default ?? null;
  const choices = def.timing ? Array.from(new Set([...def.timing.choices, ...(offset != null ? [offset] : [])])).sort((a, b) => a - b) : [];

  async function save(patch: Record<string, unknown>, note?: string) {
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/admin/automations/${def.key}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg({ ok: false, text: data.error ?? 'Couldn’t save.' });
    setState(data.state);
    if (patch.reset) {
      setSubject(def.text?.subject ?? '');
      setBody(def.text?.body ?? '');
    }
    if (note) setMsg({ ok: true, text: note });
    router.refresh();
  }

  return (
    <div className={`card !p-5 transition ${state.enabled ? '' : 'bg-surface/60'}`}>
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-ink">{def.label}</p>
            {state.customized && <span className="pill bg-gold/10 text-gold">Your wording</span>}
          </div>
          <p className="mt-1 text-sm text-slate">{def.description}</p>
          {def.timing && (
            <label className="mt-3 inline-flex items-center gap-2 text-sm">
              <span className="text-slate">Send</span>
              <select
                className="rounded-lg border border-line bg-white px-2 py-1.5 text-sm"
                value={offset ?? ''}
                disabled={busy}
                onChange={(e) => save({ offset: Number(e.target.value) }, 'Saved.')}
              >
                {choices.map((c) => (
                  <option key={c} value={c}>
                    {timingLabel(c, unit, def.timing!.direction)}
                  </option>
                ))}
              </select>
              <span className="text-slate">{def.timing.direction === 'before' ? 'the visit' : def.key === 'invoice_followup' ? 'sending, up to 3 times' : 'the clean'}</span>
            </label>
          )}
        </div>
        <Switch checked={state.enabled} disabled={busy} label={`${def.label} ${state.enabled ? 'on' : 'off'}`} onChange={(v) => save({ enabled: v }, v ? 'Turned on.' : 'Turned off.')} />
      </div>

      {def.text && (
        <div className="mt-3 border-t border-line pt-3">
          <button type="button" className="text-sm font-semibold text-gold hover:underline" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {open ? 'Hide the message' : 'Edit the message'}
          </button>
          {open && (
            <div className="mt-3 grid gap-4 lg:grid-cols-2">
              <div className="space-y-3">
                <label className="block">
                  <span className="label">Email subject</span>
                  <input className="input !py-2.5" value={subject} maxLength={140} onChange={(e) => setSubject(e.target.value)} />
                </label>
                <label className="block">
                  <span className="label">Message</span>
                  <textarea className="input min-h-[120px] !py-2.5" value={body} maxLength={1200} onChange={(e) => setBody(e.target.value)} />
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {def.text.vars.map((v) => (
                    <button key={v} type="button" className="pill bg-surface text-slate hover:bg-line" onClick={() => setBody((b) => `${b}{${v}}`)} title="Add to the message">
                      {`{${v}}`}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn-primary !px-4 !py-2 text-sm" disabled={busy} onClick={() => save({ subject, body }, 'Message saved.')}>
                    Save message
                  </button>
                  {state.customized && (
                    <button type="button" className="btn-secondary !px-4 !py-2 text-sm" disabled={busy} onClick={() => save({ reset: true }, 'Back to the standard message.')}>
                      Use the standard message
                    </button>
                  )}
                </div>
                {def.designedEmail && !state.customized && (
                  <p className="text-xs text-muted">Until you change it, this goes out as our designed email; texts use the message above.</p>
                )}
              </div>
              <div className="rounded-xl bg-surface p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-muted">Preview</p>
                <p className="mt-2 font-semibold text-ink">{render(subject, company)}</p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate">{render(body, company)}</p>
                <p className="mt-3 text-xs text-muted">
                  Goes to each client by the channel they chose — email, text{textingReady ? '' : ' (once texting is connected)'} or WhatsApp.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
      {msg && <p className={`mt-2 text-sm ${msg.ok ? 'text-green' : 'text-red-600'}`}>{msg.text}</p>}
    </div>
  );
}
