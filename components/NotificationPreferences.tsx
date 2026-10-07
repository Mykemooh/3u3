'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@/components/i18n/LocaleProvider';
import { commonMessages } from '@/lib/i18n/messages/common';

type Channel = 'EMAIL' | 'SMS' | 'WHATSAPP';

const OPTIONS: { value: Channel; label: 'notifEmail' | 'notifSms' | 'notifWhatsapp'; needsPhone: boolean }[] = [
  { value: 'EMAIL', label: 'notifEmail', needsPhone: false },
  { value: 'SMS', label: 'notifSms', needsPhone: true },
  { value: 'WHATSAPP', label: 'notifWhatsapp', needsPhone: true },
];

export default function NotificationPreferences({
  initial,
  hasPhone,
  bare,
}: {
  initial: Channel;
  hasPhone: boolean;
  /** Skip the self-contained card/heading — for nesting inside a shared section that supplies its own. */
  bare?: boolean;
}) {
  const t = useT(commonMessages);
  const router = useRouter();
  const [channel, setChannel] = useState<Channel>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function choose(value: Channel) {
    if (value === channel) return;
    setBusy(true);
    setError('');
    const res = await fetch('/api/account/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notificationChannel: value }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error || t('notifError'));
    setChannel(value);
    router.refresh();
  }

  const body = (
    <>
      {!bare && (
        <>
          <h2 className="mb-1 font-semibold text-ink">{t('notifTitle')}</h2>
          <p className="mb-4 text-sm text-slate">
            {t('notifIntro')}
          </p>
        </>
      )}
      <div className="space-y-2">
        {OPTIONS.map((opt) => {
          const disabled = busy || (opt.needsPhone && !hasPhone);
          return (
            <label key={opt.value} className={`flex items-center gap-2 text-sm ${disabled ? 'opacity-50' : ''}`}>
              <input type="radio" name="notificationChannel" checked={channel === opt.value} disabled={disabled} onChange={() => choose(opt.value)} />
              {t(opt.label)}
              {opt.needsPhone && !hasPhone && <span className="text-xs text-muted">{t('notifNeedsPhone')}</span>}
            </label>
          );
        })}
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </>
  );

  return bare ? body : <div className="card">{body}</div>;
}
