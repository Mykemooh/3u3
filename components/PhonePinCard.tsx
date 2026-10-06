'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/** A 4-digit PIN the client can say (or key in) when they call or text, so Tex knows it's really them. */
export default function PhonePinCard({ initiallySet }: { initiallySet: boolean }) {
  const router = useRouter();
  const [set, setSet] = useState(initiallySet);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function call(method: 'PUT' | 'DELETE') {
    setBusy(true);
    setMsg('');
    const res = await fetch('/api/account/pin', { method, headers: { 'Content-Type': 'application/json' }, body: method === 'PUT' ? JSON.stringify({ pin }) : undefined });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg(body.error ?? 'Could not save that.');
    setSet(method === 'PUT');
    setPin('');
    setMsg(method === 'PUT' ? 'Saved. You can now say this PIN when you call or text.' : 'PIN removed.');
    router.refresh();
  }

  return (
    <section className="card">
      <h2 className="mb-1 text-lg font-bold text-ink">Phone PIN</h2>
      <p className="mb-4 text-sm text-slate">
        Pick 4 digits. When you call or text, say them and Tex knows it’s you — then it can look up your cleans, move a clean, or update your notes without a texted code.
        Don’t use your birthday or part of your phone number. {set ? 'You have a PIN set.' : 'You don’t have one yet.'}
      </p>
      <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); if (/^\d{4}$/.test(pin)) call('PUT'); }}>
        <label>
          <span className="label">{set ? 'New PIN' : 'PIN'}</span>
          <input className="input w-28 tracking-widest" inputMode="numeric" autoComplete="off" maxLength={4} pattern="\d{4}" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} />
        </label>
        <button className="btn-primary btn-sm" disabled={busy || pin.length !== 4}>{set ? 'Change PIN' : 'Set PIN'}</button>
        {set && <button type="button" className="btn-secondary btn-sm" disabled={busy} onClick={() => call('DELETE')}>Remove</button>}
      </form>
      {msg && <p className="mt-2 text-sm text-slate" role="status">{msg}</p>}
    </section>
  );
}
