'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import ArticleBody from '@/components/help/ArticleBody';

type Row = { id: string; title: string; body: string; audience: 'PUBLIC' | 'CLIENT' | 'CREW' | 'ADMIN'; kind: 'FAQ' | 'SOP'; tags: string | null; published: boolean };

const AUDIENCE: Record<Row['audience'], string> = { PUBLIC: 'Anyone', CLIENT: 'Signed-in clients', CREW: 'Crew', ADMIN: 'Office only' };
const STARTERS: Omit<Row, 'id'>[] = [
  { title: 'What is your cancellation policy?', kind: 'FAQ', audience: 'PUBLIC', tags: 'cancel, late, fee, policy', published: true, body: 'You can move or cancel a clean from your account up to 24 hours before it starts.\n\nInside 24 hours, [say what happens — for example a fee, or no charge the first time].' },
  { title: 'Which areas do you serve?', kind: 'FAQ', audience: 'PUBLIC', tags: 'area, location, zip, city, serve, travel', published: true, body: 'We clean homes in [list the cities or ZIP codes].\n\nOutside that area? Ask anyway — we sometimes make exceptions for larger jobs.' },
  { title: 'Do you bring your own supplies?', kind: 'FAQ', audience: 'PUBLIC', tags: 'supplies, products, equipment, vacuum, chemicals, allergies', published: true, body: 'Yes — the crew brings everything, including [vacuums, microfiber cloths, products].\n\nIf you have allergies or want us to use your own products, add it to your home profile.' },
];

export default function KbManager({ articles, canEdit }: { articles: Row[]; canEdit: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<(Omit<Row, 'id'> & { id?: string }) | null>(null);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    if (!editing) return;
    setBusy(true);
    setError('');
    const res = await fetch(editing.id ? `/api/admin/kb/${editing.id}` : '/api/admin/kb', {
      method: editing.id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: editing.title, body: editing.body, audience: editing.audience, kind: editing.kind, tags: editing.tags ?? '', published: editing.published }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error ?? 'Couldn’t save.');
    setEditing(null);
    router.refresh();
  }

  async function remove(id: string) {
    if (!window.confirm('Delete this article? Tex will stop using it.')) return;
    await fetch(`/api/admin/kb/${id}`, { method: 'DELETE' });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {canEdit && !editing && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-primary !px-4 !py-2 text-sm" onClick={() => setEditing({ title: '', body: '', audience: 'PUBLIC', kind: 'FAQ', tags: '', published: true })}>
            Write an article
          </button>
          {STARTERS.filter((s) => !articles.some((a) => a.title === s.title)).map((s) => (
            <button key={s.title} type="button" className="btn-secondary !px-4 !py-2 text-sm" onClick={() => setEditing({ ...s })}>
              Start from “{s.title}”
            </button>
          ))}
        </div>
      )}

      {editing && (
        <div className="card space-y-3">
          <label className="block">
            <span className="label">Title (write it the way a client would ask)</span>
            <input className="input !py-2.5" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            <label>
              <span className="label">Who can read it</span>
              <select className="input !py-2.5" value={editing.audience} onChange={(e) => setEditing({ ...editing, audience: e.target.value as Row['audience'] })}>
                {Object.entries(AUDIENCE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label>
              <span className="label">Kind</span>
              <select className="input !py-2.5" value={editing.kind} onChange={(e) => setEditing({ ...editing, kind: e.target.value as Row['kind'] })}>
                <option value="FAQ">Question and answer</option>
                <option value="SOP">How-to (steps)</option>
              </select>
            </label>
            <label>
              <span className="label">Keywords</span>
              <input className="input !py-2.5" placeholder="cancel, late, fee" value={editing.tags ?? ''} onChange={(e) => setEditing({ ...editing, tags: e.target.value })} />
            </label>
          </div>
          <div className="flex items-center justify-between">
            <span className="label !mb-0">Article</span>
            <button type="button" className="text-sm font-semibold text-gold hover:underline" onClick={() => setPreview((p) => !p)}>
              {preview ? 'Edit' : 'Preview'}
            </button>
          </div>
          {preview ? (
            <div className="rounded-xl bg-surface p-4"><ArticleBody body={editing.body || 'Nothing yet.'} /></div>
          ) : (
            <textarea className="input min-h-[200px] !py-2.5 font-mono text-sm" value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} />
          )}
          <p className="text-xs text-muted">Leave a blank line between paragraphs. Start lines with “- ” for bullets or “1. ” for steps. Replace anything in [brackets].</p>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={editing.published} onChange={(e) => setEditing({ ...editing, published: e.target.checked })} /> Published — Tex can use it
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button type="button" className="btn-primary !px-4 !py-2 text-sm" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
            <button type="button" className="btn-secondary !px-4 !py-2 text-sm" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-line bg-white">
        {articles.length === 0 && <p className="p-5 text-sm text-muted">No company articles yet. Tex answers from the product’s help until you add your own.</p>}
        {articles.map((a) => (
          <div key={a.id} className="flex flex-wrap items-center gap-3 border-b border-line/60 px-4 py-3 last:border-0">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{a.title}</p>
              <p className="text-sm text-slate">{AUDIENCE[a.audience]} · {a.kind === 'SOP' ? 'How-to' : 'FAQ'}{a.published ? '' : ' · Draft'}</p>
            </div>
            {canEdit && (
              <div className="flex gap-1">
                <button type="button" className="rounded-lg px-2 py-1 text-sm text-slate hover:bg-surface" onClick={() => setEditing({ ...a })}>Edit</button>
                <button type="button" className="rounded-lg px-2 py-1 text-sm text-slate hover:bg-surface hover:text-red-600" onClick={() => remove(a.id)}>Delete</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
