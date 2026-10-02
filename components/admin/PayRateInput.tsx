'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function PayRateInput({ userId, initialCentsPerHour }: { userId: string; initialCentsPerHour: number | null }) {
  const router = useRouter();
  const [value, setValue] = useState(initialCentsPerHour != null ? (initialCentsPerHour / 100).toFixed(2) : '');
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    await fetch(`/api/admin/team/employees/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payRatePerHour: value === '' ? null : Number(value) }),
    });
    setBusy(false);
    router.refresh();
  }

  return (
    <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
      Pay rate: $
      <input
        type="number"
        min={0}
        step={0.01}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        disabled={busy}
        placeholder="0.00"
        className="input !w-20 !px-2 !py-1 text-sm"
      />
      / hr
    </p>
  );
}
