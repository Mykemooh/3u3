'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import LogoBadge from '@/components/LogoBadge';
import { canAccess, homeForRole } from '@/lib/nav';
import { useT } from '@/components/i18n/LocaleProvider';
import { authMessages } from '@/lib/i18n/messages/auth';

type Step = 'intro' | 'scan' | 'codes';

/**
 * Linking an authenticator app: scan, confirm with one code, save the
 * backup codes. Required for admins (no way past it), offered once to
 * everyone else with "Remind me later".
 */
function SetupInner() {
  const t = useT(authMessages);
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next');
  const optional = params.get('optional') === '1';
  const { data: session, update } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;

  const [step, setStep] = useState<Step>('intro');
  const [qr, setQr] = useState<{ qrDataUrl: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const goOn = async () => {
    const fresh = await update({ mfaRefresh: true });
    const r = (fresh?.user as { role?: string } | undefined)?.role ?? role;
    router.push(next && canAccess(r, next) ? next : homeForRole(r));
    router.refresh();
  };

  async function start() {
    setBusy(true);
    setError('');
    const res = await fetch('/api/mfa/setup', { method: 'POST' });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(body.error ?? t('mfaSetupStartFailed'));
    setQr(body);
    setStep('scan');
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await fetch('/api/mfa/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(body.error ?? t('mfaSetupNoMatch'));
    setCodes(body.backupCodes);
    setStep('codes');
  }

  async function later() {
    await fetch('/api/mfa/snooze', { method: 'POST' });
    await goOn();
  }

  function download() {
    const blob = new Blob([`${t('mfaSetupFileHeader')}\n\n${codes.join('\n')}\n`], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'backup-codes.txt';
    a.click();
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <LogoBadge />
      <div className="mt-10 w-full max-w-md">
        {step === 'intro' && (
          <>
            <h1 className="text-2xl font-bold text-ink">{t('mfaSetupTitle')}</h1>
            <p className="mt-2 text-slate">
              {t('mfaSetupIntro')}
            </p>
            {!optional && (
              <p className="mt-3 rounded-xl bg-surface px-4 py-3 text-sm text-slate">
                {t('mfaSetupRequired')}
              </p>
            )}
            <ol className="mt-5 list-decimal space-y-1 pl-5 text-sm text-slate">
              <li>{t('mfaSetupStep1')}</li>
              <li>{t('mfaSetupStep2')}</li>
              <li>{t('mfaSetupStep3')}</li>
            </ol>
            {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
            <div className="mt-6 flex flex-col gap-3">
              <button className="btn-primary w-full" onClick={start} disabled={busy}>
                {busy ? t('mfaSetupStarting') : t('mfaSetupNow')}
              </button>
              {optional ? (
                <button className="btn-secondary w-full" onClick={later}>{t('mfaSetupLater')}</button>
              ) : (
                <button className="text-sm text-muted hover:text-ink" onClick={() => signOut({ callbackUrl: '/signin' })}>
                  {t('signOut')}
                </button>
              )}
            </div>
          </>
        )}

        {step === 'scan' && qr && (
          <>
            <h1 className="text-2xl font-bold text-ink">{t('mfaSetupScanTitle')}</h1>
            <div className="mt-5 flex justify-center rounded-2xl border border-line bg-white p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr.qrDataUrl} alt={t('mfaSetupQrAlt')} width={220} height={220} />
            </div>
            <p className="mt-3 text-center text-xs text-muted">
              {t('mfaSetupCantScan')}
              <br />
              <span className="font-mono text-sm text-ink">{qr.secret.match(/.{1,4}/g)?.join(' ')}</span>
            </p>
            <form onSubmit={confirm} className="mt-6 space-y-3">
              <label className="label" htmlFor="code">{t('mfaSetupCodeLabel')}</label>
              <input
                id="code"
                className="input text-center text-2xl tracking-[0.3em]"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={7}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
              />
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button className="btn-primary w-full" disabled={busy}>{busy ? t('checking') : t('mfaSetupTurnOn')}</button>
            </form>
          </>
        )}

        {step === 'codes' && (
          <>
            <h1 className="text-2xl font-bold text-ink">{t('mfaSetupCodesTitle')}</h1>
            <p className="mt-2 text-sm text-slate">
              {t('mfaSetupCodesIntro')}
            </p>
            <ul className="mt-5 grid grid-cols-2 gap-2 rounded-2xl border border-line bg-surface p-4 font-mono text-sm text-ink">
              {codes.map((c) => <li key={c}>{c}</li>)}
            </ul>
            <div className="mt-4 flex gap-3">
              <button className="btn-secondary flex-1" onClick={download}>{t('mfaSetupDownload')}</button>
              <button className="btn-secondary flex-1" onClick={() => navigator.clipboard?.writeText(codes.join('\n'))}>{t('mfaSetupCopy')}</button>
            </div>
            <button className="btn-primary mt-4 w-full" onClick={goOn}>{t('mfaSetupSaved')}</button>
          </>
        )}
      </div>
    </main>
  );
}

export default function MfaSetupPage() {
  return (
    <Suspense>
      <SetupInner />
    </Suspense>
  );
}
