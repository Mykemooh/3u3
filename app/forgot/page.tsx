'use client';

import { useState } from 'react';
import Link from 'next/link';
import LogoBadge from '@/components/LogoBadge';

/**
 * "Forgot your username or password?" — type whatever you remember (email
 * or phone) and we send your sign-in details plus a one-hour link to pick
 * a new password (lib/passwordReset.ts). The answer is the same whether or
 * not anything matched, so this page can't reveal who has an account.
 */
export default function ForgotPage() {
  const [identifier, setIdentifier] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState<'email' | 'phone' | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const res = await fetch('/api/account/forgot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: identifier.trim() }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) return setError(data.error || 'Something went wrong. Please try again.');
    setSent(identifier.includes('@') ? 'email' : 'phone');
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <Link href="/" className="mb-10">
        <LogoBadge />
      </Link>

      <div className="w-full max-w-sm">
        {sent ? (
          <>
            <h1 className="text-2xl font-bold text-ink">Check your {sent === 'email' ? 'email' : 'messages'}</h1>
            <p className="mt-2 text-slate">
              If <span className="font-semibold text-ink">{identifier.trim()}</span> is on an account, we've just sent your sign-in details and a
              link to choose a new password
              {sent === 'phone' ? ' — by text, or to the email on your account' : ''}. The link works for 1 hour.
            </p>
            <p className="mt-4 text-sm text-slate">
              Nothing after a few minutes? Check your spam folder, or{' '}
              <button
                type="button"
                onClick={() => setSent(null)}
                className="font-semibold text-bronze underline"
              >
                try your {sent === 'email' ? 'phone number' : 'email'} instead
              </button>
              .
            </p>
            <Link href="/signin" className="btn-primary mt-8 w-full">
              Back to sign in
            </Link>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-ink">Forgot your username or password?</h1>
            <p className="mb-6 mt-1 text-sm text-slate">
              Enter the email or phone number you gave us. We'll send you what you sign in with, and a link to set a new password.
            </p>

            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className="label" htmlFor="identifier">
                  Email or phone number
                </label>
                <input
                  id="identifier"
                  className="input"
                  type="text"
                  inputMode="email"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="you@example.com or +1 281 555 0199"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  required
                />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? 'Sending…' : 'Send me a reset link'}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-slate">
              Remembered it?{' '}
              <Link href="/signin" className="font-semibold text-bronze underline">
                Sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}
