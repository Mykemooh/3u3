'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { loadStripe } from '@stripe/stripe-js/pure';
import type { Stripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { useT } from '@/components/i18n/LocaleProvider';
import { commonMessages } from '@/lib/i18n/messages/common';

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
  const t = useT(commonMessages);
  const [card, setCard] = useState(saved);
  const [adding, setAdding] = useState(false);
  const wrapClass = bare ? '' : 'card';

  if (!publishableKey) {
    return (
      <div className={wrapClass}>
        {!bare && <h2 className="mb-1 font-semibold text-ink">{t('payMethodTitle')}</h2>}
        <p className="text-[15px] text-muted">{t('payMethodNotEnabled')}</p>
      </div>
    );
  }

  return (
    <div className={wrapClass}>
      {!bare && (
        <>
          <h2 className="mb-1 font-semibold text-ink">{t('payMethodTitle')}</h2>
          <p className="mb-4 text-sm text-slate">
            {t('payMethodSecure')}
          </p>
        </>
      )}
      {card ? (
        <SavedCardView card={card} onChanged={setCard} onReplace={() => setAdding(true)} />
      ) : adding ? null : (
        <button onClick={() => setAdding(true)} className="btn-secondary btn-sm min-h-[44px]">
          {t('payMethodAdd')}
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
  const t = useT(commonMessages);
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
    if (!res.ok) return setError(data.error || t('payMethodAutopayError'));
    onChanged({ ...card, autopayEnabled: enabled });
    router.refresh();
  }

  async function remove() {
    setBusy(true);
    setError('');
    const res = await fetch('/api/account/payment-method', { method: 'DELETE' });
    setBusy(false);
    if (!res.ok) return setError(t('payMethodRemoveError'));
    onChanged(null);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line px-4 py-3">
        <div className="text-[15px]">
          <p className="font-semibold capitalize text-ink">
            {card.brand ?? t('payMethodCard')} •••• {card.last4}
          </p>
          {card.expMonth && card.expYear && (
            <p className="money text-sm text-muted">
              {t('payMethodExpires', { date: `${String(card.expMonth).padStart(2, '0')}/${card.expYear}` })}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={onReplace} className="ct-action mx-0">
            {t('payMethodReplace')}
          </button>
          <button onClick={remove} disabled={busy} className="ct-action mx-0 text-slate">
            {t('payMethodRemove')}
          </button>
        </div>
      </div>
      <label className="flex cursor-pointer items-start gap-3 text-[15px] text-ink">
        <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-[rgb(var(--c-gold))]" checked={card.autopayEnabled} disabled={busy} onChange={(e) => toggleAutopay(e.target.checked)} />
        <span>
          <span className="font-semibold">{t('payMethodAutopay')}</span> {t('payMethodAutopayHelp')}
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
  const t = useT(commonMessages);
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
          else setError(data.error || t('payMethodSetupError'));
        }
      })
      .catch(() => active && setError(t('payMethodSetupError')));
    return () => {
      active = false;
    };
  }, []);

  if (error) return <p className="mt-3 text-sm text-red-600">{error}</p>;
  if (!clientSecret) return <p className="mt-3 text-sm text-muted">{t('payMethodLoading')}</p>;

  return (
    <div className="mt-4">
      <Elements stripe={stripePromise} options={{ clientSecret }}>
        <CardFormInner onSaved={onSaved} onCancel={onCancel} showCancel={showCancel} />
      </Elements>
    </div>
  );
}

function CardFormInner({ onSaved, onCancel, showCancel }: { onSaved: (c: SavedCard) => void; onCancel: () => void; showCancel: boolean }) {
  const t = useT(commonMessages);
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
      setError(confirmError?.message || t('payMethodSaveError'));
      return;
    }
    const res = await fetch('/api/account/payment-method', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'confirm', setupIntentId: setupIntent.id }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error || t('payMethodSaveError'));
    onSaved(data);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <PaymentElement />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy || !stripe} className="btn-primary btn-sm min-h-[44px]">
          {busy ? t('saving') : t('payMethodSave')}
        </button>
        {showCancel && (
          <button type="button" onClick={onCancel} className="btn-secondary btn-sm min-h-[44px]" disabled={busy}>
            {t('cancel')}
          </button>
        )}
      </div>
    </form>
  );
}
