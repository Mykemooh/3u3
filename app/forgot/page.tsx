'use client';

import { useState } from 'react';
import Link from 'next/link';
import LogoBadge from '@/components/LogoBadge';
import { useT } from '@/components/i18n/LocaleProvider';
import { rich } from '@/lib/i18n/rich';
import { authMessages } from '@/lib/i18n/messages/auth';

/**
 * "Forgot your username or password?" — type whatever you remember (email
 * or phone) and we send your sign-in details plus a one-hour link to pick
 * a new password (lib/passwordReset.ts). The answer is the same whether or
 * not anything matched, so this page can't reveal who has an account.
 */
export default function ForgotPage() {
  const t = useT(authMessages);
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
    if (!res.ok) return setError(data.error || t('errorRetry'));
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
            <h1 className="text-2xl font-bold text-ink">{sent === 'email' ? t('forgotCheckEmail') : t('forgotCheckMessages')}</h1>
            <p className="mt-2 text-slate">
              {rich(t(sent === 'phone' ? 'forgotSentPhone' : 'forgotSentEmail'), {
                identifier: <span className="font-semibold text-ink">{identifier.trim()}</span>,
              })}
            </p>
            <p className="mt-4 text-sm text-slate">
              {rich(t('forgotNothing'), {
                retry: (
                  <button
                    type="button"
                    onClick={() => setSent(null)}
                    className="font-semibold text-bronze underline"
                  >
                    {sent === 'email' ? t('forgotTryPhone') : t('forgotTryEmail')}
                  </button>
                ),
              })}
            </p>
            <Link href="/signin" className="btn-primary mt-8 w-full">
              {t('forgotBackToSignIn')}
            </Link>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-ink">{t('forgotTitle')}</h1>
            <p className="mb-6 mt-1 text-sm text-slate">
              {t('forgotIntro')}
            </p>

            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className="label" htmlFor="identifier">
                  {t('emailOrPhone')}
                </label>
                <input
                  id="identifier"
                  className="input"
                  type="text"
                  inputMode="email"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder={t('identifierPlaceholder')}
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  required
                />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? t('forgotSending') : t('forgotSend')}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-slate">
              {rich(t('forgotRemembered'), {
                link: (
                  <Link href="/signin" className="font-semibold text-bronze underline">
                    {t('signIn')}
                  </Link>
                ),
              })}
            </p>
          </>
        )}
      </div>
    </main>
  );
}
