'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function SetupStepActions({ stepKey, skipped, extraKey }: { stepKey: string; skipped: boolean; extraKey?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const post = async (key: string, skip: boolean) => {
    setBusy(true);
    await fetch('/api/admin/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, skip }) });
    setBusy(false);
    router.refresh();
  };
  return (
    <div className="flex flex-wrap gap-3 text-sm">
      {extraKey && (
        <button disabled={busy} onClick={() => post(extraKey, true)} className="font-semibold text-bronze hover:underline">
          Looks right
        </button>
      )}
      <button disabled={busy} onClick={() => post(stepKey, !skipped)} className="text-muted hover:text-ink">
        {skipped ? 'Bring this back' : "I don't need this"}
      </button>
    </div>
  );
}
