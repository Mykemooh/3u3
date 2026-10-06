'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Switch from '@/components/ui/Switch';

export default function SignupToggle({ open }: { open: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(open);
  const [busy, setBusy] = useState(false);
  async function flip(next: boolean) {
    setBusy(true);
    setOn(next);
    const res = await fetch('/api/platform/signups', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ open: next }) });
    if (!res.ok) setOn(!next);
    setBusy(false);
    router.refresh();
  }
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-line bg-white p-5">
      <div>
        <p className="font-semibold text-ink">{on ? 'Self-serve signup is open' : 'Signup is closed — /start collects a waitlist'}</p>
        <p className="text-sm text-slate">
          {on ? 'Anyone can create a company at /start after confirming their email. Each starts on the Free plan.' : 'Turn this on when you are ready for companies to sign themselves up.'}
        </p>
      </div>
      <Switch checked={on} disabled={busy} onChange={flip} label="Self-serve signup" />
    </div>
  );
}
