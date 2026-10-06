'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/** Connect / Disconnect for a per-company account (Gusto, Xero). */
export default function ProviderConnect({ provider, connected, label }: { provider: 'gusto' | 'xero'; connected: boolean; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (!connected) {
    return (
      <a href={`/api/admin/integrations/${provider}/connect`} className="btn-primary btn-sm">
        Connect {label}
      </a>
    );
  }
  return (
    <div className="flex items-center justify-between rounded-xl border border-line px-4 py-3 text-sm">
      <span className="font-semibold text-ink">{label} connected</span>
      <button
        type="button"
        disabled={busy}
        className="text-sm text-muted hover:text-ink"
        onClick={async () => {
          if (!window.confirm(`Disconnect ${label}?`)) return;
          setBusy(true);
          await fetch(`/api/admin/integrations/${provider}/disconnect`, { method: 'POST' });
          setBusy(false);
          router.refresh();
        }}
      >
        {busy ? 'Disconnecting…' : 'Disconnect'}
      </button>
    </div>
  );
}
