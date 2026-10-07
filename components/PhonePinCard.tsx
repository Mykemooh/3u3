'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@/components/i18n/LocaleProvider';
import { commonMessages } from '@/lib/i18n/messages/common';

/** A 4-digit PIN the client can say (or key in) when they call or text, so Tex knows it's really them. */
export default function PhonePinCard({ initiallySet }: { initiallySet: boolean }) {
  const t = useT(commonMessages);
  const router = useRouter();
  const [set, setSet] = useState(initiallySet);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function call(method: 'PUT' | 'DELETE') {
    setBusy(true);
    setMsg('');
    const res = await fetch('/api/account/pin', { method, headers: { 'Content-Type': 'application/json' }, body: method === 'PUT' ? JSON.stringify({ pin }) : undefined });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg(body.error ?? t('pinSaveError'));
    setSet(method === 'PUT');
    setPin('');
    setMsg(method === 'PUT' ? t('pinSaved') : t('pinRemoved'));
    router.refresh();
  }

  return (
    <section className="card">
      <h2 className="ct-h2">{t('pinTitle')}</h2>
      <p className="mb-5 mt-1 max-w-[60ch] text-[15px] text-slate">
        {t('pinIntro')} {set ? t('pinIsSet') : t('pinNotSet')}
      </p>
      <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); if (/^\d{4}$/.test(pin)) call('PUT'); }}>
        <label>
          <span className="label">{set ? t('pinNew') : t('pinLabel')}</span>
          <input className="input money w-32 text-center text-lg tracking-[0.3em]" inputMode="numeric" autoComplete="off" maxLength={4} pattern="\d{4}" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} />
        </label>
        <button className="btn-primary btn-sm min-h-[48px]" disabled={busy || pin.length !== 4}>{set ? t('pinChange') : t('pinSet')}</button>
        {set && <button type="button" className="btn-secondary btn-sm min-h-[48px]" disabled={busy} onClick={() => call('DELETE')}>{t('remove')}</button>}
      </form>
      {msg && <p className="mt-3 text-[15px] text-slate" role="status">{msg}</p>}
    </section>
  );
}
