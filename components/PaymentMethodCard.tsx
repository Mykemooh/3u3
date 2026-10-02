'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';

export type SavedCard = {
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
  autopayEnabled: boolean;
};

/**
 * My Account → "Payment method". We never handle a card number — Stripe's
 * own Payment Element collects it and tokenizes it directly with Stripe;
 * all this app ever stores is the resulting PaymentMethod id plus
 * non-sensitive brand/last4/expiry for display (lib/payments.ts).
 */
export default function PaymentMethodCard({
  publishableKey,
  saved,
  bare,
}: {
  publishableKey: string | null;
  saved: SavedCard | null;
  /** Skip the self-contained card/heading — for nesting inside a shared "Payment" section that supplies its own. */
  bare?: boolean;
}) {
  const [card, setCard] = useState(saved);
  const [adding, setAdding] = useState(false);
  const wrapClass = bare ? '' : 'card';

  if (!publishableKey) {
    return (
      <div className={wrapClass}>
        {!bare && <h2 className="mb-1 font-semibold text-ink">Payment method</h2>}
        <p className="text-sm text-muted">Online payment setup isn't turned on for this business yet.</p>
      </div>
    );
  }

  return (
    <div className={wrapClass}>
      {!bare && (
        <>
          <h2 className="mb-1 font-semibold text-ink">Payment method</h2>
          <p className="mb-4 text-sm text-slate">
            We never see or store your card number — Stripe handles it directly and securely.
          </p>
        </>
      )}
      {card ? (
        <SavedCardView card={card} onChanged={setCard} onReplace={() => setAdding(true)} />
      ) : adding ? null : (
        <button onClick={() => setAdding(true)} className="btn-secondary !px-4 !py-2 text-sm">
          Add a payment method
        </button>
      )}
      {(adding || !card) && (
        <AddCardForm
          publishableKey={publishableKey}
          onSaved={(c) => {
            setCard(c);
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
          showCancel={adding && !!card}
        />
      )}
    </div>
  );
}

function SavedCardView({ card, onChanged, onReplace }: { card: SavedCard; onChanged: (c: SavedCard | null) => void; onReplace: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function toggleAutopay(enabled: boolean) {
    setBusy(true);
    setError('');
    const res = await fetch('/api/account/payment-method', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'autopay', enabled }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error || 'Could not update autopay.');
    onChanged({ ...card, autopayEnabled: enabled });
    router.refresh();
  }

  async function remove() {
    setBusy(true);
    setError('');
    const res = await fetch('/api/account/payment-method', { method: 'DELETE' });
    setBusy(false);
    if (!res.ok) return setError('Could not remove that card.');
    onChanged(null);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-xl border border-line px-4 py-3">
        <div className="text-sm">
          <p className="font-semibold capitalize text-ink">
            {card.brand ?? 'Card'} •••• {card.last4}
          </p>
          {card.expMonth && card.expYear && (
            <p className="text-muted">
              Expires {String(card.expMonth).padStart(2, '0')}/{card.expYear}
            </p>
          )}
        </div>
        <div className="flex gap-3">
          <button onClick={onReplace} className="text-sm font-semibold text-bronze hover:underline">
            Replace
          </button>
          <button onClick={remove} disabled={busy} className="text-sm text-muted hover:text-ink">
            Remove
          </button>
        </div>
      </div>
      <label className="flex items-start gap-2 text-sm text-ink">
        <input type="checkbox" className="mt-0.5" checked={card.autopayEnabled} disabled={busy} onChange={(e) => toggleAutopay(e.target.checked)} />
        <span>
          <span className="font-semibold">Turn on autopay</span> — automatically charge this card when an invoice is
          ready, instead of emailing a pay link.
        </span>
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

function AddCardForm({
  publishableKey,
  onSaved,
  onCancel,
  showCancel,
}: {
  publishableKey: string;
  onSaved: (c: SavedCard) => void;
  onCancel: () => void;
  showCancel: boolean;
}) {
  const stripePromise = useMemo(() => loadStripe(publishableKey), [publishableKey]);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    fetch('/api/account/payment-method', { method: 'POST' })
      .then((res) => res.json())
      .then((data) => {
        if (active) {
          if (data.clientSecret) setClientSecret(data.clientSecret);
          else setError(data.error || 'Could not start payment setup.');
        }
      })
      .catch(() => active && setError('Could not start payment setup.'));
    return () => {
      active = false;
    };
  }, []);

  if (error) return <p className="mt-3 text-sm text-red-600">{error}</p>;
  if (!clientSecret) return <p className="mt-3 text-sm text-muted">Loading…</p>;

  return (
    <div className="mt-4">
      <Elements stripe={stripePromise} options={{ clientSecret }}>
        <CardFormInner onSaved={onSaved} onCancel={onCancel} showCancel={showCancel} />
      </Elements>
    </div>
  );
}

function CardFormInner({ onSaved, onCancel, showCancel }: { onSaved: (c: SavedCard) => void; onCancel: () => void; showCancel: boolean }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setError('');
    const { error: confirmError, setupIntent } = await stripe.confirmSetup({
      elements,
      redirect: 'if_required',
    });
    if (confirmError || !setupIntent) {
      setBusy(false);
      setError(confirmError?.message || 'Could not save that card.');
      return;
    }
    const res = await fetch('/api/account/payment-method', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'confirm', setupIntentId: setupIntent.id }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error || 'Could not save that card.');
    onSaved(data);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <PaymentElement />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy || !stripe} className="btn-primary !px-4 !py-2 text-sm">
          {busy ? 'Saving…' : 'Save card'}
        </button>
        {showCancel && (
          <button type="button" onClick={onCancel} className="btn-secondary !px-4 !py-2 text-sm" disabled={busy}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
