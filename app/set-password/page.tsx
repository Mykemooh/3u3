'use client';

import { Suspense, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import LogoBadge from '@/components/LogoBadge';
import { homeForRole } from '@/lib/nav';

/**
 * Where every "create your password" email link lands — lead capture and
 * admin-added clients both get one (see lib/passwordSetup.ts). Setting the
 * password here is what turns sign-in on, so this signs them straight in
 * right after, rather than sending them back to a bare sign-in form.
 */
function SetPasswordInner() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [signingIn, setSigningIn] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password.length < 8) return setError('Password must be at least 8 characters.');
    if (password !== confirm) return setError("Those passwords don't match.");

    setLoading(true);
    const res = await fetch('/api/account/set-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) return setError(data.error || 'Something went wrong. Please try again.');

    // Password set — sign in immediately, since that's now possible.
    setSigningIn(true);
    const signInRes = await signIn('credentials', { identifier: data.identifier, password, redirect: false });
    if (signInRes?.error) {
      setSigningIn(false);
      router.push('/signin');
      return;
    }
    router.push(homeForRole('CUSTOMER'));
    router.refresh();
  }

  if (!token) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-6 py-12 text-center">
        <Link href="/" className="mb-10">
          <LogoBadge />
        </Link>
        <h1 className="text-2xl font-bold text-ink">Link missing</h1>
        <p className="mt-2 max-w-sm text-slate">
          This page needs the link from your email — please open it from there, or ask us to send a new one.
        </p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <Link href="/" className="mb-10">
        <LogoBadge />
      </Link>

      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-ink">Create your password</h1>
        <p className="mb-6 mt-1 text-sm text-slate">
          Set a password so you can sign in anytime to see your booking, photos, and invoices.
        </p>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              className="input"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
            <p className="mt-1.5 text-xs text-muted">At least 8 characters.</p>
          </div>

          <div>
            <label className="label" htmlFor="confirm">
              Confirm password
            </label>
            <input
              id="confirm"
              className="input"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={8}
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button type="submit" disabled={loading || signingIn} className="btn-primary w-full">
            {signingIn ? 'Signing you in…' : loading ? 'Saving…' : 'Create password and sign in'}
          </button>
        </form>
      </div>
    </main>
  );
}

export default function SetPasswordPage() {
  return (
    <Suspense>
      <SetPasswordInner />
    </Suspense>
  );
}
