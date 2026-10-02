'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminAlertsPanel({
  alerts,
}: {
  alerts: { id: string; triggerEvent: string; createdAt: string }[];
}) {
  const router = useRouter();
  const [dismissing, setDismissing] = useState<string | null>(null);

  async function dismiss(id: string) {
    setDismissing(id);
    await fetch(`/api/admin/notifications/${id}`, { method: 'PATCH' });
    setDismissing(null);
    router.refresh();
  }

  // Alerts are plain triggerEvent strings like "CUSTOMER_ADDRESS_CHANGED: ...".
  // Split off the leading code for a small label and show the rest as the message.
  function split(event: string) {
    const idx = event.indexOf(':');
    if (idx === -1) return { label: event, message: '' };
    return { label: event.slice(0, idx), message: event.slice(idx + 1).trim() };
  }

  if (alerts.length === 0) {
    return <p className="text-sm text-muted">Nothing needs your attention right now.</p>;
  }

  return (
    <div className="space-y-2">
      {alerts.map((a) => {
        const { label, message } = split(a.triggerEvent);
        return (
          <div key={a.id} className="flex items-start justify-between gap-3 rounded-lg bg-cream px-3 py-2 text-sm">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-bronze">{label.replace(/_/g, ' ')}</p>
              <p className="text-slate">{message || label}</p>
              <p className="mt-0.5 text-xs text-muted">{new Date(a.createdAt).toLocaleString()}</p>
            </div>
            <button
              onClick={() => dismiss(a.id)}
              disabled={dismissing === a.id}
              className="shrink-0 rounded-lg border border-line px-2 py-1 text-xs font-medium text-slate hover:border-gold hover:text-bronze"
            >
              {dismissing === a.id ? '…' : 'Dismiss'}
            </button>
          </div>
        );
      })}
    </div>
  );
}
