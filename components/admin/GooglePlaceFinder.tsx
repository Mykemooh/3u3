'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Place = { placeId: string; name: string; address: string | null };

/** Settings → Reviews: find the company on Google and use its review link (lib/googlePlaces.ts). */
export default function GooglePlaceFinder({ defaultQuery }: { defaultQuery: string }) {
  const router = useRouter();
  const [q, setQ] = useState(defaultQuery);
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    const res = await fetch(`/api/admin/settings/google-place?q=${encodeURIComponent(q)}`);
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg(data.error ?? 'Search failed.');
    setPlaces(data.places);
    if (!data.places.length) setMsg('No matches. Try the name exactly as it shows on Google Maps, with the city.');
  }

  async function use(p: Place) {
    setBusy(true);
    const res = await fetch('/api/admin/settings/google-place', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ placeId: p.placeId }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg(data.error ?? 'Couldn’t save.');
    setPlaces(null);
    setMsg(`Review link set to ${p.name}.`);
    router.refresh();
  }

  return (
    <div className="mt-4 rounded-xl bg-surface p-4">
      <p className="text-sm font-semibold text-ink">Find your review link on Google</p>
      <form onSubmit={search} className="mt-2 flex flex-wrap gap-2">
        <label className="min-w-[14rem] flex-1">
          <span className="sr-only">Business name and city</span>
          <input className="input !py-2.5" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Business name, city" />
        </label>
        <button type="submit" className="btn-secondary btn-sm" disabled={busy}>{busy ? 'Searching…' : 'Search Google'}</button>
      </form>
      {places && places.length > 0 && (
        <ul className="mt-3 divide-y divide-line rounded-xl border border-line bg-white">
          {places.map((p) => (
            <li key={p.placeId} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <span>
                <span className="font-semibold text-ink">{p.name}</span>
                {p.address && <span className="block text-muted">{p.address}</span>}
              </span>
              <button type="button" className="btn-primary btn-sm shrink-0" disabled={busy} onClick={() => use(p)}>Use this</button>
            </li>
          ))}
        </ul>
      )}
      {msg && <p className="mt-2 text-sm text-slate" role="status">{msg}</p>}
    </div>
  );
}
