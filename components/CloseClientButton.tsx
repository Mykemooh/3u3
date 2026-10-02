'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function CloseClientButton({ clientId, isActive }: { clientId: string; isActive: boolean }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function toggle() {
    const verb = isActive ? 'close' : 'reopen';
    if (isActive && !confirm('Close this client? They will no longer be able to sign in or book. Their history is kept — you can reopen them any time.')) {
      return;
    }
    setSaving(true);
    const res = await fetch(`/api/admin/clients/${clientId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !isActive }),
    });
    setSaving(false);
    if (res.ok) router.refresh();
    else alert(`Couldn't ${verb} this client — please try again.`);
  }

  return (
    <button
      onClick={toggle}
      disabled={saving}
      className={(isActive ? 'btn-secondary !border-red-200 !text-red-600 hover:!border-red-400' : 'btn-dark') + ' btn-sm'}
    >
      {saving ? 'Working…' : isActive ? 'Close client' : 'Reopen client'}
    </button>
  );
}
