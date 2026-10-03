'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ClientAddOnResetButton({ clientId, addOnServiceId }: { clientId: string; addOnServiceId: string }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function onClick() {
    setSaving(true);
    const res = await fetch(`/api/admin/clients/${clientId}/addon-rates`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ addOnServiceId }),
    });
    if (res.ok) router.refresh();
    setSaving(false);
  }

  return (
    <button onClick={onClick} disabled={saving} className="text-xs font-medium text-muted hover:text-ink">
      {saving ? 'Resetting…' : 'Reset to default'}
    </button>
  );
}
