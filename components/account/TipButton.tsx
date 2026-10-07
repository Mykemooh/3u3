'use client';

import { useState } from 'react';
import { useT } from '@/components/i18n/LocaleProvider';
import { accountMessages } from '@/lib/i18n/messages/account';

const PRESETS_CENTS = [500, 1000, 2000];

export default function TipButton({ invoiceId }: { invoiceId: string }) {
  const t = useT(accountMessages);
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function startTip(amountCents: number) {
    setBusy(true);
    setError('');
    const res = await fetch(`/api/account/invoices/${invoiceId}/tip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amountCents }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok || !data.url) return setError(data.error || t('tipError'));
    window.location.href = data.url;
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-secondary btn-sm">
        {t('tipAdd')}
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-line p-4">
      <p className="ct-label mb-3 text-ink">{t('tipAdd')}</p>
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS_CENTS.map((cents) => (
          <button key={cents} type="button" disabled={busy} onClick={() => startTip(cents)} className="btn-secondary btn-sm money min-h-[44px]">
            ${(cents / 100).toFixed(0)}
          </button>
        ))}
        <div className="flex items-center gap-1">
          <span className="text-sm text-slate">$</span>
          <input
            type="number"
            min={1}
            step={1}
            placeholder={t('tipOther')}
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            className="input money w-24 !py-2.5"
          />
          <button
            type="button"
            disabled={busy || !custom || Number(custom) <= 0}
            onClick={() => startTip(Math.round(Number(custom) * 100))}
            className="btn-primary btn-sm min-h-[44px]"
          >
            {t('tipGo')}
          </button>
        </div>
        <button type="button" onClick={() => setOpen(false)} className="ct-action mx-0 text-slate">
          {t('cancel')}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
