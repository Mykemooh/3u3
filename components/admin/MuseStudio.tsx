'use client';

import { useCallback, useEffect, useState } from 'react';

type Concept = {
  id: string; title: string; channel: 'META' | 'EMAIL' | 'TEXT'; angle: string | null; headline: string; primaryText: string; cta: string; imagePrompt: string | null;
  audience: string | null; segment: string | null; zips: string | null; dailyBudgetCents: number | null; status: 'DRAFT' | 'APPROVED' | 'PUBLISHED' | 'ARCHIVED';
  campaignId: string | null; issues: string[]; problems: string[]; imageUrl: string;
};
type PlanItem = { week: number; theme: string; channel: 'META' | 'EMAIL' | 'TEXT'; why: string; goal: string };
type Data = { concepts: Concept[]; plan: PlanItem[]; meta: { configured: boolean; connected: boolean; adAccount: string | null; page: string | null; maxDailyCents: number }; aiWriter: boolean };
type Choices = { accounts: { id: string; name: string }[]; pages: { id: string; name: string }[]; selected: { adAccountId: string | null; pageId: string | null } };

const CHANNEL = { META: 'Facebook / Instagram', EMAIL: 'Email', TEXT: 'Text message' } as const;

export default function MuseStudio() {
  const [data, setData] = useState<Data | null>(null);
  const [goal, setGoal] = useState('');
  const [channel, setChannel] = useState<'META' | 'EMAIL' | 'TEXT'>('META');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [choices, setChoices] = useState<Choices | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/muse');
    if (res.ok) setData(await res.json());
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (data?.meta.connected) fetch('/api/admin/muse/meta').then((r) => (r.ok ? r.json() : null)).then((c) => c && setChoices(c));
  }, [data?.meta.connected]);

  async function call(key: string, url: string, method: string, body?: unknown, ok?: string) {
    setBusy(key);
    setMsg('');
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const out = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) { setMsg(out.error ?? 'That didn’t work.'); return null; }
    if (ok) setMsg(typeof ok === 'string' ? ok : '');
    await load();
    return out;
  }

  async function ask(g = goal, ch = channel) {
    if (g.trim().length < 3) return setMsg('Tell Muse what you want, for example “book more deep cleans this month”.');
    const out = await call('ask', '/api/admin/muse', 'POST', { goal: g, channel: ch, count: 3 });
    if (out) { setGoal(''); setMsg(out.usedModel ? 'Here are some drafts.' : 'Here are some drafts from built-in templates (add an Anthropic key for fresher ideas).'); }
  }

  if (!data) return <p className="text-slate">Loading…</p>;
  return (
    <div className="space-y-8">
      <section className="card space-y-3">
        <h3 className="font-semibold text-ink">What do you want?</h3>
        <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); ask(); }}>
          <label className="min-w-[16rem] flex-1"><span className="label">Goal</span><input className="input" maxLength={400} placeholder="Book more deep cleans before the holidays" value={goal} onChange={(e) => setGoal(e.target.value)} /></label>
          <label><span className="label">Where</span>
            <select className="input" value={channel} onChange={(e) => setChannel(e.target.value as typeof channel)}>
              {Object.entries(CHANNEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <button className="btn-primary btn-sm" disabled={busy === 'ask'}>{busy === 'ask' ? 'Writing…' : 'Ask Muse'}</button>
        </form>
        {msg && <p className="text-sm text-slate" role="status">{msg}</p>}
      </section>

      {data.plan.length > 0 && (
        <section>
          <h3 className="mb-2 font-semibold text-ink">Suggested next four weeks</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {data.plan.map((p) => (
              <div key={p.week} className="card flex flex-col !p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">Week {p.week} · {CHANNEL[p.channel]}</p>
                <p className="mt-1 font-semibold text-ink">{p.theme}</p>
                <p className="mt-1 flex-1 text-sm text-slate">{p.why}</p>
                <button className="btn-secondary btn-sm mt-3" disabled={!!busy} onClick={() => ask(p.goal, p.channel)}>Draft this</button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold text-ink">Facebook and Instagram ads</h3>
          {data.meta.connected && <button className="btn-secondary btn-sm" onClick={() => confirm('Disconnect Facebook? Ads already created stay in your account.') && call('disc', '/api/admin/muse/meta', 'DELETE')}>Disconnect</button>}
        </div>
        {!data.meta.configured && <p className="text-sm text-slate">Not set up on this site yet. The platform owner adds META_APP_ID and META_APP_SECRET (see Settings → Integrations); until then, Muse still writes your copy and images and you can paste them into Facebook yourself.</p>}
        {data.meta.configured && !data.meta.connected && (
          <div><a className="btn-primary btn-sm" href="/api/admin/muse/meta/connect">Connect Facebook</a><p className="mt-2 text-xs text-muted">You pay Facebook directly for ad spend. Muse only ever creates ads paused — you switch them on in Ads Manager.</p></div>
        )}
        {data.meta.connected && choices && (
          <div className="flex flex-wrap items-end gap-3">
            <label><span className="label">Ad account</span><select className="input" value={choices.selected.adAccountId ?? ''} onChange={(e) => setChoices({ ...choices, selected: { ...choices.selected, adAccountId: e.target.value } })}>{choices.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
            <label><span className="label">Page</span><select className="input" value={choices.selected.pageId ?? ''} onChange={(e) => setChoices({ ...choices, selected: { ...choices.selected, pageId: e.target.value } })}>{choices.pages.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
            <button className="btn-secondary btn-sm" disabled={!!busy} onClick={() => call('pick', '/api/admin/muse/meta', 'PUT', { adAccountId: choices.selected.adAccountId, pageId: choices.selected.pageId }, 'Saved.')}>Use these</button>
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h3 className="font-semibold text-ink">Your ideas {data.concepts.length > 0 && <span className="text-sm font-normal text-muted">({data.concepts.length})</span>}</h3>
        {data.concepts.length === 0 && <p className="text-slate">Nothing yet. Ask Muse above, or tap “Draft this” on a week.</p>}
        {data.concepts.map((c) => <ConceptCard key={c.id} c={c} meta={data.meta} busy={busy} call={call} />)}
      </section>
    </div>
  );
}

function ConceptCard({ c, meta, busy, call }: { c: Concept; meta: Data['meta']; busy: string | null; call: (k: string, u: string, m: string, b?: unknown, ok?: string) => Promise<unknown> }) {
  const [v, setV] = useState({ headline: c.headline, primaryText: c.primaryText, cta: c.cta, zips: c.zips ?? '', budget: c.dailyBudgetCents ? String(c.dailyBudgetCents / 100) : '' });
  const locked = c.status === 'PUBLISHED';
  const save = (extra: Record<string, unknown> = {}) =>
    call(`save-${c.id}`, `/api/admin/muse/${c.id}`, 'PATCH', { headline: v.headline, primaryText: v.primaryText, cta: v.cta, zips: v.zips || null, dailyBudgetCents: v.budget ? Math.round(Number(v.budget) * 100) : null, ...extra });
  const tone = { DRAFT: 'bg-surface text-slate', APPROVED: 'bg-green/10 text-green', PUBLISHED: 'bg-primary/10 text-primary', ARCHIVED: '' }[c.status];
  return (
    <article className="card grid gap-4 md:grid-cols-[18rem_minmax(0,1fr)]">
      <div className="space-y-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={c.imageUrl} alt={c.imagePrompt ?? 'AI-generated image for this idea'} className="aspect-[1.91/1] w-full rounded-lg bg-surface object-cover" loading="lazy" />
        <p className="text-xs text-muted">AI-generated picture — check it looks right before using it.</p>
        {!locked && <button className="btn-secondary btn-sm" disabled={!!busy} onClick={() => call(`img-${c.id}`, `/api/admin/muse/${c.id}`, 'PATCH', { newImage: true })}>Try another picture</button>}
      </div>
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="font-semibold text-ink">{c.title}</h4>
          <span className={`pill ${tone}`}>{c.status === 'DRAFT' ? 'Draft' : c.status === 'APPROVED' ? 'Approved' : 'In Facebook (paused)'}</span>
          <span className="text-xs text-muted">{CHANNEL[c.channel]}{c.audience ? ` · ${c.audience}` : ''}</span>
        </div>
        <label className="block"><span className="label">{c.channel === 'EMAIL' ? 'Subject line' : 'Headline'}</span><input className="input" disabled={locked} maxLength={120} value={v.headline} onChange={(e) => setV({ ...v, headline: e.target.value })} /></label>
        <label className="block"><span className="label">Text</span><textarea className="input min-h-[6rem]" disabled={locked} maxLength={900} value={v.primaryText} onChange={(e) => setV({ ...v, primaryText: e.target.value })} /></label>
        <label className="block"><span className="label">Button</span><input className="input" disabled={locked} maxLength={40} value={v.cta} onChange={(e) => setV({ ...v, cta: e.target.value })} /></label>
        {c.channel === 'META' && !locked && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label><span className="label">ZIP codes to show it in</span><input className="input" placeholder="77494, 77450, 77084" value={v.zips} onChange={(e) => setV({ ...v, zips: e.target.value })} /></label>
            <label><span className="label">Daily budget ($, up to {meta.maxDailyCents / 100})</span><input className="input" inputMode="decimal" placeholder="10" value={v.budget} onChange={(e) => setV({ ...v, budget: e.target.value.replace(/[^\d.]/g, '') })} /></label>
          </div>
        )}
        {c.issues.length > 0 && !locked && <ul className="list-disc space-y-1 pl-5 text-sm text-amber-700">{c.issues.map((i) => <li key={i}>{i}</li>)}</ul>}
        {c.channel === 'META' && c.status === 'APPROVED' && c.problems.length > 0 && c.issues.length === 0 && <p className="text-sm text-slate">To send to Facebook: {c.problems[0]}</p>}
        {!locked && (
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary btn-sm" disabled={!!busy} onClick={() => save()}>Save changes</button>
            {c.status === 'DRAFT' && <button className="btn-primary btn-sm" disabled={!!busy} onClick={() => save({ status: 'APPROVED' })}>Approve</button>}
            {c.status === 'APPROVED' && !c.campaignId && c.channel !== 'META' && <button className="btn-primary btn-sm" disabled={!!busy} onClick={() => call(`camp-${c.id}`, `/api/admin/muse/${c.id}/campaign`, 'POST', undefined, 'Saved as a draft in Marketing → Growth. Review it there before sending.')}>Make it a {c.channel === 'EMAIL' ? 'email' : 'text'} campaign</button>}
            {c.status === 'APPROVED' && c.channel === 'META' && meta.connected && c.problems.length === 0 && (
              <button className="btn-primary btn-sm" disabled={!!busy} onClick={() => confirm('Create this ad in your Facebook account? It will be PAUSED — nothing runs or costs money until you switch it on in Ads Manager.') && call(`pub-${c.id}`, `/api/admin/muse/${c.id}/publish`, 'POST', { days: 7 }, 'Created in your Facebook account, paused. Open Ads Manager to review and switch it on.')}>Send to Facebook (paused)</button>
            )}
            <button className="btn-secondary btn-sm" disabled={!!busy} onClick={() => call(`arc-${c.id}`, `/api/admin/muse/${c.id}`, 'DELETE')}>Archive</button>
          </div>
        )}
        {c.campaignId && <p className="text-sm text-slate">Draft campaign saved in Growth.</p>}
      </div>
    </article>
  );
}
