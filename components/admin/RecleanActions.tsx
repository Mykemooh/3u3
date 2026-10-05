'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function RecleanActions({ reviewId, clientId }: { reviewId: string; clientId: string }) {
  const router = useRouter();
  const set = async (recleanStatus: 'SCHEDULED' | 'DONE' | 'DISMISSED') => {
    await fetch(`/api/admin/reviews/${reviewId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recleanStatus }) });
    router.refresh();
  };
  return (
    <div className="flex flex-wrap gap-3 text-sm">
      <Link href={`/admin/series/new?client=${clientId}`} onClick={() => set('SCHEDULED')} className="btn-primary btn-sm">Schedule a re-clean</Link>
      <button onClick={() => set('DONE')} className="font-semibold text-bronze hover:underline">Mark handled</button>
      <button onClick={() => set('DISMISSED')} className="text-muted hover:text-ink">Dismiss</button>
    </div>
  );
}
