'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { signIn } from 'next-auth/react';
import { translator, type Locale } from '@/lib/i18n';
import { accountMessages } from '@/lib/i18n/messages/account';

type Status = 'DRAFT' | 'SENT' | 'APPROVED' | 'DECLINED' | 'EXPIRED';

/**
 * The client-facing half of the estimate: approve or decline in one click,
 * then — for a brand-new customer who has no login yet — set a password and
 * go straight to picking their first cleaning slot.
 *
 * That password step is what makes the flow actually end-to-end. A lead
 * captured at /new has no password, so without it they'd approve and then
 * hit a sign-in wall with no way through.
 */
export default function EstimateResponse({
  token,
  initialStatus,
  expired,
  expiresAt,
  clientHasPassword,
  clientPhone,
  autoRespond,
  locale = 'en',
}: {
  token: string;
  initialStatus: Status;
  expired: boolean;
  expiresAt?: string;
  clientHasPassword: boolean;
  clientPhone?: string;
  autoRespond?: 'APPROVE' | 'DECLINE';
  locale?: Locale;
}) {
  const t = translator(accountMessages, locale);
  const [status, setStatus] = useState<Status>(initialStatus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [password, setPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  const respond = useCallback(
    async (action: 'APPROVE' | 'DECLINE') => {
      setBusy(true);
      setError('');
      try {
        const res = await fetch(`/api/estimates/${token}/respond`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error || t('estErr'));
          return;
        }
        setStatus(data.status as Status);
      } finally {
        setBusy(false);
      }
    },
    [token],
  );

  // Honour ?respond=approve|decline from the emailed buttons — one click in
  // the email lands here already answered, which is the whole point.
  const autoFired = useRef(false);
  useEffect(() => {
    if (autoFired.current) return;
    if (!autoRespond || expired) return;
    if (initialStatus !== 'SENT') return;
    autoFired.current = true;
    void respond(autoRespond);
  }, [autoRespond, expired, initialStatus, respond]);

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setSavingPassword(true);
    setPasswordError('');
    try {
      const res = await fetch(`/api/estimates/${token}/set-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPasswordError(data.error || t('estPwErr'));
        return;
      }
      // Straight into the booking flow at the rate they just approved.
      await signIn('credentials', {
        identifier: data.phone ?? clientPhone,
        password,
        callbackUrl: '/book',
      });
    } finally {
      setSavingPassword(false);
    }
  }

  if (expired && status !== 'APPROVED' && status !== 'DECLINED') {
    return (
      <p className="mt-6 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
        {t('estExpired')}
      </p>
    );
  }

  if (status === 'DECLINED') {
    return (
      <p className="mt-6 rounded-xl bg-surface px-4 py-3 text-sm text-slate">
        {t('estDeclined')}
      </p>
    );
  }

  if (status === 'APPROVED') {
    return (
      <div className="mt-6">
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          {t('estApproved')}
        </p>

        {clientHasPassword ? (
          <a href="/book" className="btn-primary mt-4 w-full">
            {t('estBookFirst')}
          </a>
        ) : (
          <form onSubmit={savePassword} className="mt-4">
            <p className="mb-3 text-sm text-slate">
              {t('estCreatePwIntro')}
            </p>
            <label className="label" htmlFor="estimate-password">
              {t('estPassword')}
            </label>
            <input
              id="estimate-password"
              className="input"
              type="password"
              minLength={8}
              required
              autoComplete="new-password"
              placeholder={t('estPwPlaceholder')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {clientPhone && (
              <p className="mt-1.5 text-xs text-muted">{t('estSignInWith', { phone: clientPhone })}</p>
            )}
            {passwordError && <p className="mt-2 text-sm text-red-600">{passwordError}</p>}
            <button type="submit" disabled={savingPassword} className="btn-primary mt-4 w-full">
              {savingPassword ? t('estSettingUp') : t('estCreatePw')}
            </button>
          </form>
        )}
      </div>
    );
  }

  // status === 'SENT' (or a DRAFT someone reached by guessing — the API
  // rejects that anyway).
  return (
    <div className="mt-6">
      {expiresAt && <p className="mb-3 text-sm text-muted">{t('estGoodThrough', { date: expiresAt })}</p>}
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      <button type="button" onClick={() => respond('APPROVE')} disabled={busy} className="btn-primary w-full">
        {busy ? t('estOneMoment') : t('estApprove')}
      </button>
      <button
        type="button"
        onClick={() => respond('DECLINE')}
        disabled={busy}
        className="mt-3 w-full text-sm text-muted hover:text-ink"
      >
        {t('estDecline')}
      </button>
    </div>
  );
}
