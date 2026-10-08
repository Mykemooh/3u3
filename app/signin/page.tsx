'use client';

import { useEffect, useState, Suspense } from 'react';
import { signIn, getSession, signOut, getProviders } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import LogoBadge from '@/components/LogoBadge';
import TrashCanMark from '@/components/TrashCanMark';
import { TcIcon } from '@/components/tc/TcLogo';
import LanguageToggle from '@/components/i18n/LanguageToggle';
import { homeForRole, canAccess } from '@/lib/nav';
import { useT } from '@/components/i18n/LocaleProvider';
import { rich } from '@/lib/i18n/rich';
import { authMessages } from '@/lib/i18n/messages/auth';

const ROLE_KEYS = {
  CUSTOMER: 'signinRoleCustomer',
  CLEANER: 'signinRoleCleaner',
  ADMIN: 'signinRoleAdmin',
  SUPER_ADMIN: 'signinRoleSuperAdmin',
} as const;

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
 *
 * Two looks share the one form: a company's own sign-in (its logo and
 * colours, via CompanyBrandFrame) and, with ?platform=1, TrashCan's — a
 * card beside a dark brand panel (docs/brand/trashcan-guidelines.md).
 */
function SignInInner() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next');
  const denied = params.get('denied');
  const authError = params.get('error');
  const platform = !!params.get('platform');
  const t = useT(authMessages);
  const ERRORS: Record<string, string> = {
    NoAccount: t('signinErrNoAccount'),
    GoogleEmail: t('signinErrGoogleEmail'),
    Closed: t('signinErrClosed'),
    MfaLocked: t('signinErrMfaLocked'),
    OAuthSignin: t('signinErrOAuthSignin'),
    OAuthCallback: t('signinErrOAuthCallback'),
    AccessDenied: t('signinErrAccessDenied'),
  };
  const roleLabel = (role: string) =>
    role in ROLE_KEYS ? t(ROLE_KEYS[role as keyof typeof ROLE_KEYS]) : role.toLowerCase();
  const [google, setGoogle] = useState(false);
  useEffect(() => {
    getProviders().then((p) => setGoogle(!!p?.google)).catch(() => setGoogle(false));
  }, []);

  const [identifier, setIdentifier] = useState(params.get('email') ?? '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
      setError(t('signinBadPassword'));
      return;
    }

    // Ask who we actually became, and go where that person belongs.
    const session = await getSession();
    const role = (session?.user as any)?.role as string | undefined;
    setLoading(false);

    if (!role) {
      setError(t('signinNoSession'));
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

  // Class names per look. The company sign-in keeps the semantic tokens its
  // brand re-points; TrashCan's uses the tc-* controls.
  const ui = platform
    ? {
        label: 'tc-label',
        input: 'tc-input',
        help: 'mt-1.5 text-[13px] leading-snug text-tc-500',
        link: 'text-[13px] font-semibold text-tc-700 underline decoration-tc-300 underline-offset-4 transition-colors hover:text-tc-black hover:decoration-tc-black',
        submit: 'tc-btn-dark tc-btn-lg w-full',
        google: 'tc-btn-ghost w-full gap-3',
        notice: 'mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900',
        error: 'rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700',
        eye: 'text-tc-500 hover:text-tc-black',
        rule: 'bg-tc-200',
        or: 'text-tc-500',
      }
    : {
        label: 'label',
        input: 'input',
        help: 'mt-1.5 text-sm text-muted',
        link: 'font-semibold text-bronze hover:underline',
        submit: 'btn-primary w-full',
        google: 'btn-secondary w-full gap-3',
        notice: 'mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800',
        error: 'text-sm text-red-600',
        eye: 'text-muted hover:text-ink',
        rule: 'bg-line',
        or: 'text-muted',
      };

  const form = (
    <>
      {authError && ERRORS[authError] && <p className={ui.notice}>{ERRORS[authError]}</p>}

      {google && (
        <>
          <button
            type="button"
            onClick={() => signIn('google', { callbackUrl: next ? `/mfa-check?next=${encodeURIComponent(next)}` : '/mfa-check' })}
            className={`${ui.google} mb-4`}
          >
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.2l7.8 6.1C12.4 13.6 17.7 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/>
              <path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.8l7.8-6.1z"/>
              <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.8 6.1C6.6 42.6 14.6 48 24 48z"/>
            </svg>
            {t('signinWithGoogle')}
          </button>
          <div className={`mb-4 flex items-center gap-3 text-sm ${ui.or}`}>
            <span className={`h-px flex-1 ${ui.rule}`} /> {t('signinOr')} <span className={`h-px flex-1 ${ui.rule}`} />
          </div>
        </>
      )}

      {denied && <p className={ui.notice}>{t('signinDenied')}</p>}

      {current && (
        <div className={`${platform ? 'mb-5' : 'mb-4'} rounded-xl border border-line bg-surface px-4 py-3 text-sm`}>
          <p className="text-slate">
            {rich(current.role ? t('signinAlreadyAsRole', { role: roleLabel(current.role) }) : t('signinAlreadyAs'), {
              name: <span className="font-semibold text-ink">{current.name}</span>,
            })}
          </p>
          <div className="mt-2 flex gap-3">
            <button
              type="button"
              onClick={() => router.push(homeForRole(current.role))}
              className="font-semibold text-bronze hover:underline"
            >
              {t('signinContinueArrow')}
            </button>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: '/signin' })}
              className="text-muted hover:text-ink"
            >
              {t('signOut')}
            </button>
          </div>
        </div>
      )}

      <form onSubmit={onSubmit} className={platform ? 'space-y-5' : 'space-y-4'}>
        <div>
          <label className={ui.label} htmlFor="identifier">
            {t('emailOrPhone')}
          </label>
          <input
            id="identifier"
            className={ui.input}
            type="text"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            placeholder={t('identifierPlaceholder')}
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            aria-describedby="identifier-help"
            required
          />
          <p id="identifier-help" className={ui.help}>
            {t('signinIdentifierHelp')}
          </p>
        </div>

        <div>
          <label className={ui.label} htmlFor="password">
            {t('password')}
          </label>
          <div className="relative">
            <input
              id="password"
              className={`${ui.input} pr-12`}
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-controls="password"
              aria-pressed={showPassword}
              aria-label={t('signinShowPassword')}
              title={showPassword ? t('signinHidePassword') : t('signinShowPassword')}
              className={`absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-[10px] transition-colors ${ui.eye}`}
            >
              {showPassword ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 3l18 18" />
                  <path d="M10.6 5.1A10.8 10.8 0 0 1 12 5c5 0 8.6 3.6 10 7-.5 1.2-1.3 2.5-2.4 3.6M6.6 6.6C4.5 7.9 2.9 9.9 2 12c1.4 3.4 5 7 10 7 1.9 0 3.6-.5 5-1.3" />
                  <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M2 12c1.4-3.4 5-7 10-7s8.6 3.6 10 7c-1.4 3.4-5 7-10 7S3.4 15.4 2 12z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>
          <p className={`text-right ${platform ? 'mt-2.5' : 'mt-1.5 text-sm'}`}>
            <Link href="/forgot" className={ui.link}>
              {t('signinForgot')}
            </Link>
          </p>
        </div>

        {error && (
          <p role="alert" className={ui.error}>
            {error}
          </p>
        )}

        <button type="submit" disabled={loading} className={ui.submit}>
          {loading ? t('signinSigningIn') : t('signIn')}
        </button>
      </form>
    </>
  );

  if (!platform) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
        <Link href="/" className="mb-10">
          <LogoBadge />
        </Link>

        <div className="w-full max-w-sm">
          <h1 className="ct-title">{t('signIn')}</h1>
          <p className="mb-6 mt-1 text-sm text-slate">{t('signinIntro')}</p>

          {form}

          <p className="mt-6 text-center text-sm text-slate">
            {rich(t('signinNewHere'), {
              link: (
                <Link href="/new" className="font-semibold text-bronze underline">
                  {t('signinGetQuote')}
                </Link>
              ),
            })}
          </p>
          <p className="mt-2 text-center text-sm text-muted">{t('signinNewAccountNote')}</p>
        </div>
      </main>
    );
  }

  // TrashCan's own sign-in (the marketing site's "Log in", and /start): the
  // card on the left, the dark brand panel on the right from lg up. The
  // panel's little board is decorative — generic jobs, no real names.
  const jobs = [
    { time: '8:30', job: t('signinPanelJobStandard'), crew: 'A', status: t('signinPanelDone'), tone: 'done' },
    { time: '11:00', job: t('signinPanelJobDeep'), crew: 'B', status: t('signinPanelOnTheWay'), tone: 'live' },
    { time: '2:15', job: t('signinPanelJobMoveOut'), crew: 'A', status: t('signinPanelScheduled'), tone: 'next' },
  ] as const;

  return (
    <main
      className="theme-tc min-h-screen bg-tc-50 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]"
      data-tc-surface=""
      data-tc-signin=""
    >
      <div className="flex min-h-screen flex-col px-4 py-4 sm:px-8 sm:py-6 lg:px-12">
        {/* The EN | ES toggle lives here on this page; AuthLocaleFrame's
            corner copy is hidden (app/globals.css, [data-tc-signin]). */}
        <header className="flex items-center justify-between gap-4">
          <Link href="/start" className="rounded-lg">
            <TrashCanMark />
          </Link>
          <LanguageToggle tone="light" />
        </header>

        <div className="flex flex-1 items-start justify-center pb-8 pt-6 sm:items-center sm:py-12">
          <div className="w-full max-w-[440px] animate-tc-rise">
            <div className="rounded-2xl bg-white p-6 shadow-[0_0_0_1px_rgba(11,15,20,0.06),0_1px_2px_rgba(11,15,20,0.04),0_18px_40px_-18px_rgba(11,15,20,0.16)] sm:p-9">
              <h1 className="font-tc-display text-[28px] font-extrabold leading-[1.1] tracking-[-0.025em] text-tc-black sm:text-[32px]">
                {t('signIn')}
              </h1>
              <p className="mb-7 mt-2 text-pretty text-[15px] leading-relaxed text-tc-500">{t('signinIntro')}</p>
              {form}
            </div>

            <p className="mt-6 text-center text-sm text-tc-700">
              {rich(t('signinNewCompany'), {
                link: (
                  <Link href="/start" className="tc-link">
                    {t('signinGetStartedFree')}
                  </Link>
                ),
              })}
            </p>
          </div>
        </div>
      </div>

      <aside
        aria-label={t('signinPanelLabel')}
        className="tc-dark relative hidden overflow-hidden lg:sticky lg:top-3 lg:my-3 lg:mr-3 lg:flex lg:h-[calc(100vh-1.5rem)] lg:min-h-[640px] lg:flex-col lg:rounded-3xl"
      >
        <div className="tc-grid-bg pointer-events-none absolute inset-0" aria-hidden="true" />
        <div
          className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full opacity-20 blur-3xl"
          style={{ background: 'radial-gradient(circle, #B8FF00 0%, transparent 70%)' }}
          aria-hidden="true"
        />

        <div className="relative flex flex-1 flex-col justify-between gap-10 p-10 xl:p-14">
          <TcIcon size={44} />

          <div className="max-w-[460px]">
            <h2 className="font-tc-display text-[34px] font-extrabold leading-[1.08] tracking-[-0.03em] text-white xl:text-[40px]">
              {t('signinPanelTitle')}
            </h2>
            <ul className="mt-7 space-y-3.5">
              {(['signinPanelPoint1', 'signinPanelPoint2', 'signinPanelPoint3'] as const).map((k) => (
                <li key={k} className="flex items-start gap-3 text-[15px] leading-snug text-white/80">
                  <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-tc-lime/15 text-tc-lime" aria-hidden="true">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>
                  </span>
                  {t(k)}
                </li>
              ))}
            </ul>

            <div
              className="mt-10 rounded-2xl border border-white/10 bg-tc-black-2 p-4 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.6)]"
              aria-hidden="true"
            >
              <div className="mb-3 flex items-center justify-between px-1">
                <span className="font-tc-display text-sm font-bold text-white">{t('signinPanelToday')}</span>
                <span className="flex gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
                  <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
                  <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
                </span>
              </div>
              <ul className="space-y-1.5">
                {jobs.map((j) => (
                  <li key={j.time} className="flex items-center gap-3 rounded-xl bg-white/[0.04] px-3 py-2.5">
                    <span className="w-10 shrink-0 text-xs font-semibold tabular-nums text-white/50">{j.time}</span>
                    <span
                      className={`h-8 w-1 shrink-0 rounded-full ${
                        j.tone === 'live' ? 'bg-tc-lime' : j.tone === 'done' ? 'bg-white/30' : 'bg-white/10'
                      }`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-white">{j.job}</span>
                      <span className="block text-xs text-white/45">{t('signinPanelCrew', { crew: j.crew })}</span>
                    </span>
                    <span
                      className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                        j.tone === 'live'
                          ? 'bg-tc-lime text-tc-black'
                          : j.tone === 'done'
                            ? 'bg-white/10 text-white/70'
                            : 'border border-white/15 text-white/60'
                      }`}
                    >
                      {j.status}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <p className="text-sm text-white/50">{t('signinPanelFoot')}</p>
        </div>
      </aside>
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
