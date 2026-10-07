'use client';

import { useState } from 'react';
import { useT } from '@/components/i18n/LocaleProvider';
import { accountMessages } from '@/lib/i18n/messages/account';

/**
 * Asked once, on the client's before-and-after gallery — exactly where
 * they're looking at the photos in question. Their answer (yes or no,
 * both count) is remembered and covers every future cleaning too, so this
 * never prompts again — it just shows a one-line reminder of their answer
 * with a way to change it, rather than asking fresh on every job.
 */
export default function SocialMediaConsent({ initialConsent }: { initialConsent: boolean | null }) {
  const t = useT(accountMessages);
  const [consent, setConsent] = useState(initialConsent);
  const [busy, setBusy] = useState(false);

  async function answer(value: boolean) {
    setBusy(true);
    const res = await fetch('/api/account/social-consent', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ consent: value }),
    });
    setBusy(false);
    if (res.ok) setConsent(value);
  }

  if (consent !== null) {
    return (
      <p className="card text-sm text-slate">
        {consent ? t('consentYesNote') : t('consentNoNote')}{' '}
        <button onClick={() => answer(!consent)} disabled={busy} className="font-semibold text-bronze hover:underline">
          {t('consentChange')}
        </button>
      </p>
    );
  }

  return (
    <div className="card space-y-3">
      <p className="font-semibold text-ink">{t('consentAsk')}</p>
      <p className="text-sm text-slate">
        {t('consentBody')}
      </p>
      <div className="flex gap-2">
        <button onClick={() => answer(true)} disabled={busy} className="btn-primary !px-4 !py-2 text-sm">
          {t('consentYes')}
        </button>
        <button onClick={() => answer(false)} disabled={busy} className="btn-secondary !px-4 !py-2 text-sm">
          {t('consentNo')}
        </button>
      </div>
    </div>
  );
}
