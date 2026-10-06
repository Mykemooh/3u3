'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function CompanyBilling({ id, exempt, textingStatus, hasNumber }: { id: string; exempt: boolean; textingStatus: string; hasNumber: boolean }) {
  const router = useRouter();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function send(body: Record<string, unknown>, done: string) {
    setBusy(true);
    setMsg('');
    const res = await fetch(`/api/platform/companies/${id}/billing`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    setMsg(res.ok ? done : data.error ?? 'Something went wrong.');
    if (res.ok) router.refresh();
  }

  return (
    <div className="space-y-5">
      <label className="flex items-start gap-3">
        <input type="checkbox" className="mt-1 h-5 w-5" checked={exempt} disabled={busy} onChange={(e) => send({ billingExempt: e.target.checked }, e.target.checked ? 'Now a house account.' : 'Back on its own plan.')} />
        <span>
          <span className="block text-[14px] font-semibold">House account</span>
          <span className="block text-[13px] text-tc-500">Team features, no platform fee, no metered usage. For the platform’s own company and anyone you waive.</span>
        </span>
      </label>

      <form
        className="grid gap-2 sm:grid-cols-[120px_1fr_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          send({ adjustCents: Math.round(Number(amount) * 100), note }, 'Credits adjusted.');
        }}
      >
        <input className="tc-input" inputMode="decimal" placeholder="$ amount" aria-label="Credit adjustment in dollars (negative to remove)" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <input className="tc-input" placeholder="Why (shows in their history)" aria-label="Reason" value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="tc-btn-ghost" disabled={busy || !Number(amount) || !note.trim()}>Adjust credits</button>
      </form>

      {textingStatus === 'REGISTERING' && (
        <div className="rounded-tc-md bg-blue-50 p-4 text-[14px] text-blue-900 ring-1 ring-blue-200">
          <p className="font-semibold">Texting setup paid — waiting on you</p>
          <p className="mt-1">Buy their number in Twilio, file the A2P 10DLC brand and campaign, add the number to the company, then mark it live.</p>
          <button type="button" className="tc-btn-dark tc-btn-sm mt-3" disabled={busy || !hasNumber} onClick={() => send({ textingLive: true }, 'Marked live — the company has been told.')}>
            Mark number live
          </button>
        </div>
      )}
      {msg && <p role="status" className="text-[14px] font-medium">{msg}</p>}
    </div>
  );
}
