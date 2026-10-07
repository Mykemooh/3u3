'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Person = { id: string; name: string; email: string | null };
type Check = { id: string; userId: string; status: string; result: string | null; createdAt: string; completedAt: string | null };

const LABEL: Record<string, [string, string]> = {
  INVITED: ['Form sent', 'bg-gold/10 text-bronze'],
  PENDING: ['In progress', 'bg-amber-50 text-amber-800'],
  CLEAR: ['Clear', 'bg-green-light text-green'],
  CONSIDER: ['Needs review', 'bg-amber-100 text-amber-900'],
  SUSPENDED: ['On hold at Checkr', 'bg-amber-50 text-amber-800'],
  DISPUTE: ['Disputed', 'bg-amber-50 text-amber-800'],
  EXPIRED: ['Form expired', 'bg-surface text-slate'],
  CANCELED: ['Cancelled', 'bg-surface text-slate'],
};

const OPEN = ['INVITED', 'PENDING', 'SUSPENDED', 'DISPUTE'];

/** Team → Background checks (lib/checkr.ts). */
export default function BackgroundChecks({ people, checks, defaultState, defaultCity, packageName }: { people: Person[]; checks: Check[]; defaultState: string; defaultCity: string; packageName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [where, setWhere] = useState({ state: defaultState, city: defaultCity });

  async function send(p: Person) {
    if (!window.confirm(`Send ${p.name} a background check? Checkr emails them a form to fill in and consent; your Checkr account is billed for the ${packageName} package.`)) return;
    setBusy(p.id);
    setError('');
    const res = await fetch('/api/admin/team/background-checks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: p.id, ...where }) });
    setBusy(null);
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error ?? 'Couldn’t send.');
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label>
          <span className="label">Work state</span>
          <input className="input w-20 !py-2" maxLength={2} value={where.state} onChange={(e) => setWhere({ ...where, state: e.target.value.toUpperCase() })} />
        </label>
        <label>
          <span className="label">City</span>
          <input className="input w-44 !py-2" value={where.city} onChange={(e) => setWhere({ ...where, city: e.target.value })} />
        </label>
        <p className="pb-2 text-muted">Package: {packageName}</p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="divide-y divide-line rounded-xl border border-line">
        {people.length === 0 && <p className="p-4 text-sm text-muted">No team members yet.</p>}
        {people.map((p) => {
          const latest = checks.find((c) => c.userId === p.id);
          const [label, cls] = latest ? LABEL[latest.status] ?? [latest.status, 'bg-surface text-slate'] : ['', ''];
          const open = latest && OPEN.includes(latest.status);
          return (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
              <div>
                <p className="font-semibold text-ink">{p.name}</p>
                <p className="text-muted">
                  {latest ? `Sent ${new Date(latest.createdAt).toLocaleDateString()}${latest.completedAt ? ` · finished ${new Date(latest.completedAt).toLocaleDateString()}` : ''}` : p.email ?? 'No email on file'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {latest && <span className={`pill ${cls}`}>{label}</span>}
                {!open && (
                  <button type="button" className="btn-secondary btn-sm" disabled={busy === p.id || !p.email} onClick={() => send(p)}>
                    {busy === p.id ? 'Sending…' : latest ? 'Run again' : 'Send background check'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted">Reports stay in your Checkr dashboard; only the status and overall result are kept here.</p>
    </div>
  );
}
