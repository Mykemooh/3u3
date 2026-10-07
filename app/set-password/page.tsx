'use client';

import { Suspense, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import LogoBadge from '@/components/LogoBadge';
import { homeForRole } from '@/lib/nav';
import { useT } from '@/components/i18n/LocaleProvider';
import { rich } from '@/lib/i18n/rich';
import { authMessages } from '@/lib/i18n/messages/auth';

/**
 * Where every "create your password" email link lands — lead capture and
 * admin-added clients both get one (see lib/passwordSetup.ts) — and every
 * "forgot password" link too (?reset=1, lib/passwordReset.ts). Setting the
 * password here is what turns sign-in on, so this signs them straight in
 * right after, rather than sending them back to a bare sign-in form.
 */
function SetPasswordInner() {
  const t = useT(authMessages);
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const isReset = params.get('reset') === '1';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [linkDead, setLinkDead] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password.length < 8) return setError(t('setPwTooShort'));
    if (password !== confirm) return setError(t('setPwMismatch'));

    setLoading(true);
    const res = await fetch('/api/account/set-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      setError(data.error || t('errorRetry'));
      setLinkDead(res.status === 400 && /link/i.test(data.error ?? ''));
      return;
    }

    // Password set — sign in immediately, since that's now possible.
    setSigningIn(true);
    const signInRes = await signIn('credentials', { identifier: data.identifier, password, redirect: false });
    if (signInRes?.error) {
      setSigningIn(false);
      router.push('/signin');
      return;
    }
    router.push(homeForRole(data.role ?? 'CUSTOMER'));
    router.refresh();
  }

  if (!token) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-6 py-12 text-center">
        <Link href="/" className="mb-10">
          <LogoBadge />
        </Link>
        <h1 className="ct-title">{t('setPwLinkMissing')}</h1>
        <p className="mt-2 max-w-sm text-slate">
          {rich(t('setPwLinkMissingBody'), {
            link: (
              <Link href="/forgot" className="font-semibold text-bronze underline">
                {t('setPwGetNewLink')}
              </Link>
            ),
          })}
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
        <h1 className="ct-title">{isReset ? t('setPwResetTitle') : t('setPwCreateTitle')}</h1>
        <p className="mb-6 mt-1 text-sm text-slate">
          {isReset ? t('setPwResetIntro') : t('setPwCreateIntro')}
        </p>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="label" htmlFor="password">
              {t('password')}
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
            <p className="mt-1.5 text-sm text-muted">{t('setPwHelp')}</p>
          </div>

          <div>
            <label className="label" htmlFor="confirm">
              {t('setPwConfirm')}
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

          {error && (
            <p className="text-sm text-red-600">
              {error}
              {linkDead && (
                <>
                  {' '}
                  <Link href="/forgot" className="font-semibold underline">
                    {t('setPwSendNewLink')}
                  </Link>
                </>
              )}
            </p>
          )}

          <button type="submit" disabled={loading || signingIn} className="btn-primary w-full">
            {signingIn ? t('setPwSigningIn') : loading ? t('setPwSaving') : isReset ? t('setPwSaveAndSignIn') : t('setPwCreateAndSignIn')}
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
