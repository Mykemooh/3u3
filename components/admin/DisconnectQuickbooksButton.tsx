'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function DisconnectQuickbooksButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function disconnect() {
    if (!confirm('Disconnect QuickBooks? New payments will stop syncing until you reconnect.')) return;
    setBusy(true);
    await fetch('/api/admin/integrations/quickbooks/disconnect', { method: 'POST' });
    setBusy(false);
    router.refresh();
  }

  return (
    <button onClick={disconnect} disabled={busy} className="text-sm text-muted hover:text-ink">
      {busy ? 'Disconnecting…' : 'Disconnect'}
    </button>
  );
}
