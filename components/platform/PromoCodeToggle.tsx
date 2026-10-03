'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function PromoCodeToggle({ id, active }: { id: string; active: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    const res = await fetch(`/api/platform/promo-codes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !active }),
    });
    if (res.ok) router.refresh();
    setBusy(false);
  }

  return (
    <button type="button" onClick={toggle} disabled={busy} className="text-xs font-semibold text-muted hover:text-ink">
      {busy ? 'Saving…' : active ? 'Deactivate' : 'Reactivate'}
    </button>
  );
}
