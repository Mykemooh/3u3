'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

/** `job`: the visit it was for — set on tolls the crew app records (lib/trips.ts). */
type Expense = { id: string; spentOn: string; category: string; vendor: string | null; amountCents: number; notes: string | null; crewId: string | null; job?: { id: string; client: string } | null };
type Option = { id: string; name: string };

const money = (c: number) => `$${(c / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateLabel = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric' });

export default function ExpensesManager({
  expenses,
  categories,
  crews,
  today,
  startOpen,
}: {
  expenses: Expense[];
  categories: readonly string[];
  crews: Option[];
  today: string;
  startOpen: boolean;
}) {
  const router = useRouter();
  const blank = { spentOn: today, category: categories[0], vendor: '', amount: '', notes: '', crewId: '' };
  const [form, setForm] = useState<typeof blank & { id?: string }>(blank);
  const [open, setOpen] = useState(startOpen);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    setBusy(true);
    setError('');
    const payload = {
      spentOn: form.spentOn,
      category: form.category,
      vendor: form.vendor || null,
      amountCents: Math.round(Number(form.amount) * 100),
      notes: form.notes || null,
      crewId: form.crewId || null,
    };
    if (!(payload.amountCents > 0)) {
      setBusy(false);
      return setError('Enter the amount.');
    }
    const res = await fetch(form.id ? `/api/admin/expenses/${form.id}` : '/api/admin/expenses', {
      method: form.id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error ?? 'Couldn’t save.');
    setForm(blank);
    setOpen(false);
    router.refresh();
  }

  async function remove(id: string) {
    if (!window.confirm('Remove this expense?')) return;
    const res = await fetch(`/api/admin/expenses/${id}`, { method: 'DELETE' });
    if (res.ok) router.refresh();
  }

  return (
    <div className="space-y-4">
      {!open ? (
        <button type="button" className="btn-primary !px-4 !py-2 text-sm" onClick={() => { setForm(blank); setOpen(true); }}>
          Record an expense
        </button>
      ) : (
        <div className="card">
          <h3 className="mb-3 font-semibold">{form.id ? 'Edit expense' : 'Record an expense'}</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label>
              <span className="label">Date</span>
              <input type="date" className="input !py-2.5" value={form.spentOn} max={today} onChange={(e) => setForm({ ...form, spentOn: e.target.value })} />
            </label>
            <label>
              <span className="label">Category</span>
              <select className="input !py-2.5" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="label">Amount ($)</span>
              <input type="number" inputMode="decimal" min="0.01" step="0.01" className="input !py-2.5" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </label>
            <label>
              <span className="label">Where (optional)</span>
              <input className="input !py-2.5" placeholder="e.g. Costco, Shell" value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} />
            </label>
            <label>
              <span className="label">Team (optional)</span>
              <select className="input !py-2.5" value={form.crewId} onChange={(e) => setForm({ ...form, crewId: e.target.value })}>
                <option value="">Whole business</option>
                {crews.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
            <label className="sm:col-span-2 lg:col-span-1">
              <span className="label">Note (optional)</span>
              <input className="input !py-2.5" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </label>
          </div>
          <div className="mt-4 flex gap-2">
            <button type="button" className="btn-primary !px-4 !py-2 text-sm" disabled={busy} onClick={save}>
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="btn-secondary !px-4 !py-2 text-sm" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-line bg-white">
        {expenses.length === 0 && <p className="p-6 text-center text-sm text-muted">Nothing recorded this month.</p>}
        {expenses.map((e) => (
          <div key={e.id} className="flex items-center gap-3 border-b border-line/60 px-4 py-3 last:border-0">
            <span className="w-14 shrink-0 text-sm text-muted">{dateLabel(e.spentOn)}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{e.vendor || e.category}</p>
              <p className="truncate text-sm text-slate">
                {e.vendor ? e.category : ''}
                {e.crewId ? `${e.vendor ? ' · ' : ''}${crews.find((c) => c.id === e.crewId)?.name ?? 'Team'}` : ''}
                {e.job && (
                  <>
                    {e.vendor || e.crewId ? ' · ' : ''}
                    <Link href={`/crew/jobs/${e.job.id}`} className="font-semibold text-bronze hover:underline">
                      {e.job.client}’s clean
                    </Link>
                  </>
                )}
                {e.notes ? ` · ${e.notes}` : ''}
              </p>
            </div>
            <span className="shrink-0 font-semibold">{money(e.amountCents)}</span>
            <div className="flex shrink-0 gap-1">
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-sm text-slate hover:bg-surface"
                onClick={() => {
                  setForm({ id: e.id, spentOn: e.spentOn, category: e.category, vendor: e.vendor ?? '', amount: (e.amountCents / 100).toFixed(2), notes: e.notes ?? '', crewId: e.crewId ?? '' });
                  setOpen(true);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              >
                Edit
              </button>
              <button type="button" className="rounded-lg px-2 py-1 text-sm text-slate hover:bg-surface hover:text-red-600" onClick={() => remove(e.id)}>
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
