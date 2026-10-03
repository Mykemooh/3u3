'use client';

import { useState } from 'react';

export default function BillingPanel({ stripeConfigured }: { stripeConfigured: boolean }) {
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const [code, setCode] = useState('');
  const [redeemStatus, setRedeemStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [redeemError, setRedeemError] = useState('');

  async function subscribe() {
    setCheckoutBusy(true);
    setCheckoutError('');
    const res = await fetch('/api/admin/billing/checkout', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.url) {
      setCheckoutBusy(false);
      return setCheckoutError(data.error || 'Could not start checkout.');
    }
    window.location.href = data.url;
  }

  async function redeem(e: React.FormEvent) {
    e.preventDefault();
    setRedeemStatus('saving');
    setRedeemError('');
    const res = await fetch('/api/admin/billing/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setRedeemStatus('error');
      return setRedeemError(data.error || 'Something went wrong.');
    }
    setRedeemStatus('done');
    setTimeout(() => window.location.reload(), 1200);
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <h2 className="mb-2 font-semibold text-ink">Subscribe</h2>
        <p className="mb-4 text-sm text-slate">Keep your admin tools active with a monthly subscription.</p>
        {stripeConfigured ? (
          <button type="button" onClick={subscribe} disabled={checkoutBusy} className="btn-primary">
            {checkoutBusy ? 'Starting checkout…' : 'Subscribe'}
          </button>
        ) : (
          <p className="text-sm text-amber-700">Billing isn't configured yet — contact the platform owner.</p>
        )}
        {checkoutError && <p className="mt-2 text-sm text-red-600">{checkoutError}</p>}
      </div>

      <div className="card">
        <h2 className="mb-2 font-semibold text-ink">Redeem a code</h2>
        <p className="mb-4 text-sm text-slate">Have a free-trial or free-access code? Enter it here.</p>
        {redeemStatus === 'done' ? (
          <p className="font-semibold text-emerald-700">✓ Redeemed — refreshing…</p>
        ) : (
          <form onSubmit={redeem} className="flex flex-wrap items-end gap-3">
            <input
              className="input w-48 uppercase"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="CODE"
              required
            />
            <button type="submit" disabled={redeemStatus === 'saving'} className="btn-secondary">
              {redeemStatus === 'saving' ? 'Checking…' : 'Redeem'}
            </button>
          </form>
        )}
        {redeemError && <p className="mt-2 text-sm text-red-600">{redeemError}</p>}
      </div>
    </div>
  );
}
