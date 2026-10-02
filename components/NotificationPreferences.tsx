'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Channel = 'EMAIL' | 'SMS' | 'WHATSAPP';

const OPTIONS: { value: Channel; label: string; needsPhone: boolean }[] = [
  { value: 'EMAIL', label: 'Email', needsPhone: false },
  { value: 'SMS', label: 'Text message (SMS)', needsPhone: true },
  { value: 'WHATSAPP', label: 'WhatsApp', needsPhone: true },
];

export default function NotificationPreferences({ initial, hasPhone }: { initial: Channel; hasPhone: boolean }) {
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
    if (!res.ok) return setError(data.error || 'Could not update that.');
    setChannel(value);
    router.refresh();
  }

  return (
    <div className="card">
      <h2 className="mb-1 font-semibold text-ink">Notifications</h2>
      <p className="mb-4 text-sm text-slate">
        Where we send booking reminders (3 days, then 36 hours before a cleaning) and other updates.
      </p>
      <div className="space-y-2">
        {OPTIONS.map((opt) => {
          const disabled = busy || (opt.needsPhone && !hasPhone);
          return (
            <label key={opt.value} className={`flex items-center gap-2 text-sm ${disabled ? 'opacity-50' : ''}`}>
              <input type="radio" name="notificationChannel" checked={channel === opt.value} disabled={disabled} onChange={() => choose(opt.value)} />
              {opt.label}
              {opt.needsPhone && !hasPhone && <span className="text-xs text-muted">(add a phone number first)</span>}
            </label>
          );
        })}
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
