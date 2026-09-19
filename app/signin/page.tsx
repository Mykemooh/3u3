'use client';

import { useEffect, useState, Suspense } from 'react';
import { signIn, getSession, signOut } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import LogoBadge from '@/components/LogoBadge';
import { homeForRole, canAccess } from '@/lib/nav';

/**
 * One sign-in screen for everyone — owner, cleaner, customer.
 *
 * The previous version had three entry links (?role=admin / crew / none)
 * and sent you wherever that URL said, regardless of who actually signed
 * in. Sign in with cleaner credentials on the admin link and it would
 * accept you, push you at /admin, get you rejected there, and drop you
 * back on this form with no error shown — indistinguishable from a wrong
 * password. Now the destination comes from the session that was actually
 * created, so it can't disagree with itself.
 */
function SignInInner() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next');
  const denied = params.get('denied');

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Someone may already be signed in — as a different person than the one
  // they're now trying to reach a page as. Say so, rather than silently
  // leaving them wondering.
  const [current, setCurrent] = useState<{ name?: string | null; role?: string } | null>(null);
  useEffect(() => {
    let live = true;
    getSession().then((s) => {
      if (!live) return;
      if (s?.user) setCurrent({ name: s.user.name, role: (s.user as any).role });
    });
    return () => {
      live = false;
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const res = await signIn('credentials', {
      identifier: identifier.trim(),
      password,
      redirect: false,
    });

    if (res?.error) {
      setLoading(false);
      setError("That email or phone and password don't match an account.");
      return;
    }

    // Ask who we actually became, and go where that person belongs.
    const session = await getSession();
    const role = (session?.user as any)?.role as string | undefined;
    setLoading(false);

    if (!role) {
      setError('Signed in, but the session did not stick. Please try again.');
      return;
    }

    const target = next && canAccess(role, next) ? next : homeForRole(role);
    router.push(target);
    router.refresh();
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-white px-6 py-12">
      <Link href="/" className="mb-10">
        <LogoBadge />
      </Link>

      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-ink">Sign in</h1>
        <p className="mb-6 mt-1 text-sm text-ink/60">
          Customers, cleaners and office staff all sign in here — we'll take you to the right place.
        </p>

        {denied && (
          <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            That page isn't available to your account. Sign in with one that has access.
          </p>
        )}

        {current && (
          <div className="mb-4 rounded-xl border border-ink/10 bg-ink/[0.03] px-4 py-3 text-sm">
            <p className="text-ink/70">
              Already signed in as <span className="font-semibold text-ink">{current.name}</span>
              {current.role ? ` (${current.role.toLowerCase()})` : ''}.
            </p>
            <div className="mt-2 flex gap-3">
              <button
                type="button"
                onClick={() => router.push(homeForRole(current.role))}
                className="font-semibold text-bronze hover:underline"
              >
                Continue →
              </button>
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: '/signin' })}
                className="text-ink/50 hover:text-ink"
              >
                Sign out
              </button>
            </div>
          </div>
        )}

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
            <p className="mt-1.5 text-xs text-ink/40">
              Staff use their work email. Customers use the phone number they booked with.
            </p>
          </div>

          <div>
            <label className="label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-ink/60">
          New here?{' '}
          <Link href="/new" className="font-semibold text-bronze underline">
            Get a free quote
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInInner />
    </Suspense>
  );
}
