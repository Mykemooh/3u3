'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ResolveSupplyButton({ reportId }: { reportId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function resolve() {
    setBusy(true);
    const res = await fetch(`/api/admin/supplies/${reportId}`, { method: 'PATCH' });
    if (res.ok) router.refresh();
    setBusy(false);
  }

  return (
    <button type="button" onClick={resolve} disabled={busy} className="btn-secondary !px-3 !py-1.5 text-sm">
      {busy ? 'Saving…' : 'Mark resolved'}
    </button>
  );
}
