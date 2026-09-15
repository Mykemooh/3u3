'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { signIn } from 'next-auth/react';

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
}: {
  token: string;
  initialStatus: Status;
  expired: boolean;
  expiresAt?: string;
  clientHasPassword: boolean;
  clientPhone?: string;
  autoRespond?: 'APPROVE' | 'DECLINE';
}) {
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
          setError(data.error || 'Something went wrong. Please try again.');
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
        setPasswordError(data.error || 'Could not save that password.');
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
        This estimate has expired. Give us a call and we'll send you an updated price.
      </p>
    );
  }

  if (status === 'DECLINED') {
    return (
      <p className="mt-6 rounded-xl bg-ink/5 px-4 py-3 text-sm text-ink/70">
        Thanks for letting us know — no hard feelings. If anything changes, we'd be glad to hear from you.
      </p>
    );
  }

  if (status === 'APPROVED') {
    return (
      <div className="mt-6">
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          Approved — thank you! This price is locked in for you.
        </p>

        {clientHasPassword ? (
          <a href="/book" className="btn-primary mt-4 w-full">
            Book your first clean
          </a>
        ) : (
          <form onSubmit={savePassword} className="mt-4">
            <p className="mb-3 text-sm text-ink/70">
              Create a password and you can pick your first cleaning time right now.
            </p>
            <label className="label" htmlFor="estimate-password">
              Password
            </label>
            <input
              id="estimate-password"
              className="input"
              type="password"
              minLength={8}
              required
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {clientPhone && (
              <p className="mt-1.5 text-xs text-ink/50">You'll sign in with {clientPhone} from now on.</p>
            )}
            {passwordError && <p className="mt-2 text-sm text-red-600">{passwordError}</p>}
            <button type="submit" disabled={savingPassword} className="btn-primary mt-4 w-full">
              {savingPassword ? 'Setting up…' : 'Create password & pick a time'}
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
      {expiresAt && <p className="mb-3 text-sm text-ink/50">Good through {expiresAt}.</p>}
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      <button type="button" onClick={() => respond('APPROVE')} disabled={busy} className="btn-primary w-full">
        {busy ? 'One moment…' : 'Approve this estimate'}
      </button>
      <button
        type="button"
        onClick={() => respond('DECLINE')}
        disabled={busy}
        className="mt-3 w-full text-sm text-ink/50 hover:text-ink"
      >
        No thanks
      </button>
    </div>
  );
}
