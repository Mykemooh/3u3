'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import LogoBadge from '@/components/LogoBadge';
import { canAccess, homeForRole } from '@/lib/nav';

/** Second sign-in step: a code from the authenticator app, an emailed code, or a backup code. */
function MfaInner() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next');
  const { data: session, update, status } = useSession();
  const [code, setCode] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  const role = (session?.user as { role?: string } | undefined)?.role;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const fresh = await update({ mfaCode: code.trim() });
    const user = fresh?.user as { mfaPending?: boolean; mfaLocked?: boolean; role?: string } | undefined;
    if (user?.mfaLocked) {
      await signOut({ callbackUrl: '/signin?error=MfaLocked' });
      return;
    }
    if (!user || user.mfaPending) {
      setBusy(false);
      setError("That code didn't work. Codes from the app change every 30 seconds — use the newest one.");
      return;
    }
    if (remember) await fetch('/api/mfa/trust', { method: 'POST' });
    router.push(next && canAccess(user.role, next) ? next : homeForRole(user.role));
    router.refresh();
  }

  async function emailMe() {
    setError('');
    setInfo('');
    const res = await fetch('/api/mfa/email-code', { method: 'POST' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) setError(body.error ?? 'Could not send a code.');
    else setInfo(`We emailed a 6-digit code to ${body.sentTo}. It works for 10 minutes.`);
  }

  if (status === 'unauthenticated') {
    router.replace('/signin');
    return null;
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <LogoBadge />
      <div className="mt-10 w-full max-w-sm">
        <h1 className="text-2xl font-bold text-ink">Two-step sign-in</h1>
        <p className="mb-6 mt-1 text-sm text-slate">
          Enter the 6-digit code from your authenticator app{role === 'CUSTOMER' ? '' : ', or one of your backup codes'}.
        </p>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label" htmlFor="code">Code</label>
            <input
              id="code"
              className="input text-center text-2xl tracking-[0.3em]"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              maxLength={11}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Remember this device for 30 days
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {info && <p className="rounded-xl bg-green-light px-4 py-3 text-sm text-ink">{info}</p>}
          <button className="btn-primary w-full" disabled={busy}>{busy ? 'Checking…' : 'Continue'}</button>
        </form>
        <div className="mt-6 space-y-2 text-center text-sm">
          <button type="button" onClick={emailMe} className="font-semibold text-bronze hover:underline">
            Email me a code instead
          </button>
          <p>
            <button type="button" onClick={() => signOut({ callbackUrl: '/signin' })} className="text-muted hover:text-ink">
              Sign out
            </button>
          </p>
        </div>
      </div>
    </main>
  );
}

export default function MfaPage() {
  return (
    <Suspense>
      <MfaInner />
    </Suspense>
  );
}
