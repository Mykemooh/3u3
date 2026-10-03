'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const TIERS = [
  { value: 'TRIAL_1MO', label: '1 month trial' },
  { value: 'TRIAL_3MO', label: '3 month trial' },
  { value: 'FOREVER', label: 'Forever (never expires)' },
] as const;

function randomCode(): string {
  return Array.from({ length: 8 }, () => '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 32)]).join('');
}

export default function PromoCodeCreateForm() {
  const router = useRouter();
  const [code, setCode] = useState(randomCode());
  const [tier, setTier] = useState<(typeof TIERS)[number]['value']>('TRIAL_1MO');
  const [maxRedemptions, setMaxRedemptions] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle');
  const [error, setError] = useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('saving');
    setError('');
    const res = await fetch('/api/platform/promo-codes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, tier, maxRedemptions: maxRedemptions ? Number(maxRedemptions) : undefined }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setCode(randomCode());
      setMaxRedemptions('');
      setStatus('idle');
      router.refresh();
    } else {
      setStatus('error');
      setError(data.error || 'Something went wrong.');
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <div>
        <label className="label">Code</label>
        <input className="input w-40 uppercase" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} required />
      </div>
      <div>
        <label className="label">Tier</label>
        <select className="input" value={tier} onChange={(e) => setTier(e.target.value as typeof tier)}>
          {TIERS.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Max redemptions</label>
        <input className="input w-32" type="number" min={1} placeholder="Unlimited" value={maxRedemptions} onChange={(e) => setMaxRedemptions(e.target.value)} />
      </div>
      <button type="submit" disabled={status === 'saving'} className="btn-primary">
        {status === 'saving' ? 'Creating…' : '+ Create code'}
      </button>
      {status === 'error' && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
