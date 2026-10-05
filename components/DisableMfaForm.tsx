'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

export default function DisableMfaForm() {
  const router = useRouter();
  const { update } = useSession();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const res = await fetch('/api/mfa/disable', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setError(body.error ?? 'Could not turn it off.');
    await update({ mfaRefresh: true });
    router.refresh();
  }

  if (!open) {
    return (
      <button className="mt-4 text-sm text-muted hover:text-ink" onClick={() => setOpen(true)}>
        Turn off two-step sign-in
      </button>
    );
  }
  return (
    <form onSubmit={submit} className="mt-4 space-y-2">
      <label className="label" htmlFor="off-code">Enter a current code to turn it off</label>
      <input id="off-code" className="input" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} required />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button className="btn-secondary">Turn off</button>
    </form>
  );
}
