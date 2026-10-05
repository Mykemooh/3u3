'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Campaign = { id: string; name: string; segment: string; subject: string; body: string; status: 'DRAFT' | 'SENT'; sentCount: number; sentAt: string | null };
type SegmentOpt = { key: string; label: string; detail: string; count: number };

const STARTERS = [
  {
    name: 'Holiday booking reminder',
    subject: 'Holiday guests coming, {firstName}?',
    body: 'Hi {firstName},\n\nThe holidays fill our calendar fast. If you would like your home ready before guests arrive, now is the time to book — reply to this email or pick a time in your account: {bookingLink}\n\nThank you for letting {company} look after your home.',
  },
  {
    name: 'Spring deep clean',
    subject: 'Spring is here — time for a deep clean?',
    body: 'Hi {firstName},\n\nA deep clean resets everything a regular clean doesn’t reach: baseboards, inside cabinets, behind the appliances. Want one before summer? Book in your account: {bookingLink}\n\n— {company}',
  },
];

async function call(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? 'Something went wrong.');
  return data;
}

export default function CampaignsManager({ campaigns, segments, company, emailReady }: { campaigns: Campaign[]; segments: SegmentOpt[]; company: string; emailReady: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Partial<Campaign> | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const segLabel = (k: string) => segments.find((s) => s.key === k)?.label ?? k;

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setMsg(null);
    try {
      const result = await fn();
      setMsg({ ok: true, text: typeof result === 'string' ? result : ok });
      setEditing(null);
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const preview = (t: string) => t.replace(/\{firstName\}/g, 'Maria').replace(/\{company\}/g, company).replace(/\{bookingLink\}/g, 'https://…/account');

  return (
    <div className="space-y-4">
      {!emailReady && (
        <p className="rounded-xl border border-gold/30 bg-gold/5 p-3 text-sm text-slate">
          Email isn’t connected yet — you can write campaigns now and send them once your Resend key is added.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary !px-4 !py-2 text-sm" onClick={() => setEditing({ segment: 'ALL_ACTIVE', name: '', subject: '', body: '' })}>
          New campaign
        </button>
        {STARTERS.map((s) => (
          <button key={s.name} type="button" className="btn-secondary !px-4 !py-2 text-sm" onClick={() => setEditing({ segment: 'ALL_ACTIVE', ...s })}>
            Start from “{s.name}”
          </button>
        ))}
      </div>

      {editing && (
        <div className="card grid gap-5 lg:grid-cols-2">
          <div className="space-y-3">
            <label className="block">
              <span className="label">Name (only you see this)</span>
              <input className="input !py-2.5" value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </label>
            <fieldset>
              <legend className="label">Who it goes to</legend>
              <div className="space-y-1.5">
                {segments.map((s) => (
                  <label key={s.key} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${editing.segment === s.key ? 'border-gold bg-gold/5' : 'border-line'}`}>
                    <input type="radio" name="segment" className="mt-1" checked={editing.segment === s.key} onChange={() => setEditing({ ...editing, segment: s.key })} />
                    <span className="flex-1">
                      <span className="flex justify-between gap-2 font-semibold">
                        {s.label}
                        <span className="text-sm font-normal text-muted">{s.count} {s.count === 1 ? 'person' : 'people'}</span>
                      </span>
                      <span className="text-sm text-slate">{s.detail}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="block">
              <span className="label">Subject</span>
              <input className="input !py-2.5" maxLength={140} value={editing.subject ?? ''} onChange={(e) => setEditing({ ...editing, subject: e.target.value })} />
            </label>
            <label className="block">
              <span className="label">Message</span>
              <textarea className="input min-h-[180px] !py-2.5" maxLength={5000} value={editing.body ?? ''} onChange={(e) => setEditing({ ...editing, body: e.target.value })} />
              <span className="mt-1 block text-xs text-muted">Use {'{firstName}'}, {'{company}'} and {'{bookingLink}'}. An unsubscribe link is added for you.</span>
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-primary !px-4 !py-2 text-sm"
                disabled={busy}
                onClick={() =>
                  run(
                    () =>
                      editing.id
                        ? call(`/api/admin/campaigns/${editing.id}`, 'PATCH', { name: editing.name, segment: editing.segment, subject: editing.subject, body: editing.body })
                        : call('/api/admin/campaigns', 'POST', editing),
                    'Draft saved.',
                  )
                }
              >
                Save draft
              </button>
              <button type="button" className="btn-secondary !px-4 !py-2 text-sm" onClick={() => setEditing(null)}>
                Cancel
              </button>
            </div>
          </div>
          <div className="self-start rounded-xl bg-surface p-4 lg:sticky lg:top-24">
            <p className="text-xs font-bold uppercase tracking-wide text-muted">Preview</p>
            <p className="mt-2 font-semibold">{preview(editing.subject ?? '')}</p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate">{preview(editing.body ?? '')}</p>
            <p className="mt-4 text-xs text-muted">— {company}. Don’t want news and offers? Unsubscribe</p>
          </div>
        </div>
      )}

      {msg && <p className={`text-sm ${msg.ok ? 'text-green' : 'text-red-600'}`}>{msg.text}</p>}

      <div className="overflow-hidden rounded-2xl border border-line bg-white">
        {campaigns.length === 0 && <p className="p-6 text-center text-sm text-muted">No campaigns yet.</p>}
        {campaigns.map((c) => {
          const audience = segments.find((s) => s.key === c.segment)?.count ?? 0;
          return (
            <div key={c.id} className="flex flex-wrap items-center gap-3 border-b border-line/60 p-4 last:border-0">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{c.name}</p>
                <p className="text-sm text-slate">
                  {segLabel(c.segment)} · “{c.subject}”
                </p>
              </div>
              {c.status === 'SENT' ? (
                <span className="pill bg-green/10 text-green">
                  Sent to {c.sentCount} · {c.sentAt ? new Date(c.sentAt).toLocaleDateString() : ''}
                </span>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn-secondary !px-3 !py-1.5 text-sm" onClick={() => setEditing(c)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn-secondary !px-3 !py-1.5 text-sm"
                    disabled={busy}
                    onClick={() => run(() => call(`/api/admin/campaigns/${c.id}`, 'DELETE'), 'Draft deleted.')}
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    className="btn-primary !px-3 !py-1.5 text-sm"
                    disabled={busy || !emailReady || audience === 0}
                    title={audience === 0 ? 'Nobody in this group yet' : undefined}
                    onClick={() => {
                      if (window.confirm(`Send “${c.subject}” to ${audience} ${audience === 1 ? 'person' : 'people'} now? This can't be undone.`)) {
                        run(async () => {
                          const r = await call(`/api/admin/campaigns/${c.id}/send`, 'POST');
                          return `Sent to ${r.sent} of ${r.audience}.`;
                        }, 'Sent.');
                      }
                    }}
                  >
                    Send to {audience}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
