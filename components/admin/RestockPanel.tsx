'use client';

import { useCallback, useEffect, useState } from 'react';

type Group = { vendor: string; label: string; cartUrl: string | null; lines: { id: string; name: string; qty: number; packSize: string | null; why: string; link: string }[] };
type Item = { id: string; name: string; vendor: string; sku: string | null; url: string | null; packSize: string | null; orderQty: number; parLevel: number; onHand: number };
const VENDORS: Record<string, string> = { AMAZON: 'Amazon', WALMART: 'Walmart', SAMS: 'Sam’s Club', COSTCO: 'Costco', HOME_DEPOT: 'Home Depot', GRAINGER: 'Grainger', OTHER: 'Other' };
const shop = (name: string) => `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(name)}`;

export default function RestockPanel() {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [unmatched, setUnmatched] = useState<{ id: string; productName: string; status: string }[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({ name: '', vendor: 'AMAZON', sku: '', packSize: '', orderQty: '1', parLevel: '0', onHand: '0' });

  const load = useCallback(async () => {
    const [r, i] = await Promise.all([fetch('/api/admin/supplies/restock'), fetch('/api/admin/supplies/items')]);
    if (r.ok) { const d = await r.json(); setGroups(d.groups); setUnmatched(d.unmatched); }
    if (i.ok) setItems((await i.json()).items);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function go(url: string, method: string, body?: unknown, ok?: string) {
    setBusy(true); setMsg('');
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const out = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMsg(out.error ?? 'That didn’t work.'); return false; }
    if (ok) setMsg(ok);
    await load();
    return out;
  }

  const num = (s: string) => Math.max(0, Math.round(Number(s) || 0));
  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-ink">Restock</h2>
          <p className="max-w-2xl text-sm text-slate">What to buy now: items at or under the amount you like to keep, and anything a crew flagged. Each store gets one link; you check out yourself. Nothing is bought for you.</p>
        </div>
        {groups && groups.length > 0 && <button className="btn-secondary btn-sm" disabled={busy} onClick={() => go('/api/admin/supplies/restock', 'POST', { action: 'email' }, 'Sent to your email.')}>Email me this list</button>}
      </div>
      {msg && <p className="text-sm text-slate" role="status">{msg}</p>}

      {groups && groups.length === 0 && <div className="card text-center text-muted">{items.length ? 'Nothing needs restocking right now.' : 'Add the products you reorder below (or start with a typical list) and Tex will tell you when to buy.'}</div>}
      {groups?.map((g) => (
        <div key={g.vendor} className="card space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold text-ink">{g.label}</h3>
            <div className="flex flex-wrap gap-2">
              {g.cartUrl && <a className="btn-primary btn-sm" href={g.cartUrl} target="_blank" rel="noopener noreferrer">Open cart with these items</a>}
              <button className="btn-secondary btn-sm" disabled={busy} onClick={() => go('/api/admin/supplies/restock', 'POST', { action: 'ordered', itemIds: g.lines.map((l) => l.id) }, 'Marked as ordered — counts updated.')}>I ordered these</button>
            </div>
          </div>
          <ul className="divide-y divide-line">
            {g.lines.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span><span className="font-medium text-ink">{l.name}</span> × {l.qty}{l.packSize ? ` (${l.packSize})` : ''}<span className="block text-xs text-muted">{l.why}</span></span>
                <span className="flex gap-3"><a className="text-primary underline" href={l.link} target="_blank" rel="noopener noreferrer">View</a><a className="text-primary underline" href={shop(l.name)} target="_blank" rel="noopener noreferrer">Compare prices</a></span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {unmatched.length > 0 && (
        <div className="card text-sm text-slate">
          <p className="font-medium text-ink">Crew flagged things that aren’t in your list yet</p>
          <p className="mt-1">{unmatched.map((u) => u.productName).join(', ')}. Add them below so they show up here next time.</p>
        </div>
      )}

      <div className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold text-ink">Your supply list</h3>
          {items.length === 0 && <button className="btn-secondary btn-sm" disabled={busy} onClick={() => go('/api/admin/supplies/items', 'POST', { starter: true }, 'Added a typical list — edit the stores, links and amounts to match what you buy.')}>Start with a typical list</button>}
        </div>
        {items.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-muted"><tr><th className="py-1 pr-3">Product</th><th className="pr-3">Store</th><th className="pr-3">Amazon ASIN</th><th className="pr-3">On hand</th><th className="pr-3">Keep</th><th className="pr-3">Order</th><th /></tr></thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id} className="border-t border-line">
                    <td className="py-1 pr-3 font-medium text-ink">{i.name}{i.packSize ? <span className="block text-xs font-normal text-muted">{i.packSize}</span> : null}</td>
                    <td className="pr-3">{VENDORS[i.vendor]}</td>
                    <td className="pr-3 text-xs text-muted">{i.sku ?? '—'}</td>
                    <td className="pr-3"><input className="input !w-16 !py-1" inputMode="numeric" defaultValue={i.onHand} onBlur={(e) => num(e.target.value) !== i.onHand && go(`/api/admin/supplies/items/${i.id}`, 'PATCH', { onHand: num(e.target.value) })} /></td>
                    <td className="pr-3"><input className="input !w-16 !py-1" inputMode="numeric" defaultValue={i.parLevel} onBlur={(e) => num(e.target.value) !== i.parLevel && go(`/api/admin/supplies/items/${i.id}`, 'PATCH', { parLevel: num(e.target.value) })} /></td>
                    <td className="pr-3">{i.orderQty}</td>
                    <td><button className="text-xs text-slate underline" disabled={busy} onClick={() => go(`/api/admin/supplies/items/${i.id}`, 'DELETE')}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <form className="grid gap-3 border-t border-line pt-3 sm:grid-cols-6" onSubmit={async (e) => { e.preventDefault(); const ok = await go('/api/admin/supplies/items', 'POST', { name: draft.name, vendor: draft.vendor, sku: draft.sku || null, packSize: draft.packSize || null, orderQty: Math.max(1, num(draft.orderQty)), parLevel: num(draft.parLevel), onHand: num(draft.onHand) }); if (ok) setDraft({ ...draft, name: '', sku: '', packSize: '' }); }}>
          <label className="sm:col-span-2"><span className="label">Product</span><input className="input" required minLength={2} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
          <label><span className="label">Store</span><select className="input" value={draft.vendor} onChange={(e) => setDraft({ ...draft, vendor: e.target.value })}>{Object.entries(VENDORS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label><span className="label">Amazon ASIN (optional)</span><input className="input" maxLength={10} placeholder="B07XXXXXXX" value={draft.sku} onChange={(e) => setDraft({ ...draft, sku: e.target.value.toUpperCase() })} /></label>
          <label><span className="label">Keep on hand</span><input className="input" inputMode="numeric" value={draft.parLevel} onChange={(e) => setDraft({ ...draft, parLevel: e.target.value })} /></label>
          <label><span className="label">Order each time</span><input className="input" inputMode="numeric" value={draft.orderQty} onChange={(e) => setDraft({ ...draft, orderQty: e.target.value })} /></label>
          <div className="sm:col-span-6"><button className="btn-primary btn-sm" disabled={busy}>Add to my list</button></div>
        </form>
        <p className="text-xs text-muted">Tip: on an Amazon product page, the ASIN is the 10-character code in the link after /dp/. With it, one click fills your cart.</p>
      </div>
    </section>
  );
}
