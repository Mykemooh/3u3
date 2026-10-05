'use client';

import { useEffect, useState, Suspense } from 'react';
import { signIn, getSession, signOut, getProviders } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import LogoBadge from '@/components/LogoBadge';
import TrashCanMark from '@/components/TrashCanMark';
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
  const authError = params.get('error');
  const ERRORS: Record<string, string> = {
    NoAccount: "That Google account's email isn't on file here. Sign in with your phone or email and password, or ask the office to add your email.",
    GoogleEmail: 'Google did not share a verified email for that account.',
    Closed: 'This account has been closed. Please contact the office.',
    MfaLocked: 'Too many wrong codes — sign in again to get a fresh start.',
    OAuthSignin: 'Google sign-in could not start. Please try again.',
    OAuthCallback: 'Google sign-in did not finish. Please try again.',
    AccessDenied: "That account can't sign in here.",
  };
  const [google, setGoogle] = useState(false);
  useEffect(() => {
    getProviders().then((p) => setGoogle(!!p?.google)).catch(() => setGoogle(false));
  }, []);

  const [identifier, setIdentifier] = useState(params.get('email') ?? '');
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
    const user = session?.user as { mfaPending?: boolean; mfaSetup?: string | null } | undefined;
    if (user?.mfaPending || user?.mfaSetup) {
      const step = user.mfaPending ? '/mfa' : `/mfa/setup${user.mfaSetup === 'prompt' ? '?optional=1&' : '?'}`;
      router.push(`${step}${step.includes('?') ? '' : '?'}next=${encodeURIComponent(target)}`);
      router.refresh();
      return;
    }
    router.push(target);
    router.refresh();
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      {/* Coming from TrashCan signup (/start): the platform's mark, not 3U3's. */}
      {params.get('platform') ? (
        <Link href="/start" className="mb-10">
          <TrashCanMark />
        </Link>
      ) : (
        <Link href="/" className="mb-10">
          <LogoBadge />
        </Link>
      )}

      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-ink">Sign in</h1>
        <p className="mb-6 mt-1 text-sm text-slate">
          Customers, cleaners and office staff all sign in here — we'll take you to the right place.
        </p>

        {authError && ERRORS[authError] && (
          <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{ERRORS[authError]}</p>
        )}

        {google && (
          <>
            <button
              type="button"
              onClick={() => signIn('google', { callbackUrl: next ? `/mfa-check?next=${encodeURIComponent(next)}` : '/mfa-check' })}
              className="btn-secondary mb-4 w-full gap-3"
            >
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.2l7.8 6.1C12.4 13.6 17.7 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/>
                <path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.8l7.8-6.1z"/>
                <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.8 6.1C6.6 42.6 14.6 48 24 48z"/>
              </svg>
              Continue with Google
            </button>
            <div className="mb-4 flex items-center gap-3 text-xs text-muted">
              <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
            </div>
          </>
        )}

        {denied && (
          <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            That page isn't available to your account. Sign in with one that has access.
          </p>
        )}

        {current && (
          <div className="mb-4 rounded-xl border border-line bg-surface px-4 py-3 text-sm">
            <p className="text-slate">
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
                className="text-muted hover:text-ink"
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
            <p className="mt-1.5 text-xs text-muted">
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
            <p className="mt-1.5 text-right text-xs">
              <Link href="/forgot" className="font-semibold text-bronze hover:underline">
                Forgot your username or password?
              </Link>
            </p>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        {params.get('platform') ? (
          <p className="mt-6 text-center text-sm text-slate">
            New company?{' '}
            <Link href="/start" className="font-semibold text-bronze underline">
              Start a free trial
            </Link>
          </p>
        ) : (
          <>
            <p className="mt-6 text-center text-sm text-slate">
              New here?{' '}
              <Link href="/new" className="font-semibold text-bronze underline">
                Get a free quote
              </Link>
            </p>
            <p className="mt-2 text-center text-xs text-muted">
              A new account will be created for you after your quote request.
            </p>
          </>
        )}
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
