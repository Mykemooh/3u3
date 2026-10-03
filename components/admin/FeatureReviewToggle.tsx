'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function FeatureReviewToggle({ reviewId, featured }: { reviewId: string; featured: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    const res = await fetch(`/api/admin/reviews/${reviewId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ featured: !featured }),
    });
    if (res.ok) router.refresh();
    setBusy(false);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      className={featured ? 'btn-secondary !px-3 !py-1.5 text-sm' : 'btn-primary !px-3 !py-1.5 text-sm'}
    >
      {busy ? 'Saving…' : featured ? 'Remove from carousel' : 'Feature on landing page'}
    </button>
  );
}
