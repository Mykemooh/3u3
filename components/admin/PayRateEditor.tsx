'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type PayType = 'HOURLY' | 'PER_CLEAN' | 'DAY_RATE';

const PAY_TYPE_OPTIONS: { value: PayType; label: string; rateLabel: string }[] = [
  { value: 'HOURLY', label: 'Hourly (clock in/out)', rateLabel: 'per hour' },
  { value: 'PER_CLEAN', label: 'Per clean (flat rate per job)', rateLabel: 'per clean' },
  { value: 'DAY_RATE', label: 'Full workday (flat daily rate)', rateLabel: 'per day' },
];

export default function PayRateEditor({
  userId,
  initialPayType,
  initialRatesCents,
}: {
  userId: string;
  initialPayType: PayType;
  initialRatesCents: { hourly: number | null; perClean: number | null; perDay: number | null };
}) {
  const router = useRouter();
  const [payType, setPayType] = useState<PayType>(initialPayType);
  const [rates, setRates] = useState({
    HOURLY: initialRatesCents.hourly != null ? (initialRatesCents.hourly / 100).toFixed(2) : '',
    PER_CLEAN: initialRatesCents.perClean != null ? (initialRatesCents.perClean / 100).toFixed(2) : '',
    DAY_RATE: initialRatesCents.perDay != null ? (initialRatesCents.perDay / 100).toFixed(2) : '',
  });
  const [busy, setBusy] = useState(false);

  async function save(next: { payType?: PayType; rate?: string }) {
    const effectiveType = next.payType ?? payType;
    const effectiveRate = next.rate ?? rates[effectiveType];
    setBusy(true);
    const body: Record<string, unknown> = { payType: effectiveType };
    const rateValue = effectiveRate === '' ? null : Number(effectiveRate);
    if (effectiveType === 'HOURLY') body.payRatePerHour = rateValue;
    if (effectiveType === 'PER_CLEAN') body.payRatePerClean = rateValue;
    if (effectiveType === 'DAY_RATE') body.payRatePerDay = rateValue;
    await fetch(`/api/admin/team/employees/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setBusy(false);
    router.refresh();
  }

  const meta = PAY_TYPE_OPTIONS.find((o) => o.value === payType)!;

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-muted">
      <select
        className="input !w-auto !py-1 text-sm"
        value={payType}
        disabled={busy}
        onChange={(e) => {
          const next = e.target.value as PayType;
          setPayType(next);
          save({ payType: next });
        }}
      >
        {PAY_TYPE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <span>$</span>
      <input
        type="number"
        min={0}
        step={0.01}
        value={rates[payType]}
        disabled={busy}
        onChange={(e) => setRates((r) => ({ ...r, [payType]: e.target.value }))}
        onBlur={() => save({})}
        placeholder="0.00"
        className="input !w-20 !px-2 !py-1 text-sm"
      />
      <span>{meta.rateLabel}</span>
    </div>
  );
}
