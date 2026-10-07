'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import AddressInput, { type PickedAddress } from '@/components/AddressInput';
import { useT } from '@/components/i18n/LocaleProvider';
import { commonMessages } from '@/lib/i18n/messages/common';

export default function AddressForm({
  endpoint,
  initial,
  onSaved,
}: {
  endpoint: string;
  initial: { line1: string; city: string; state: string; zip?: string | null; notes?: string | null; bedrooms?: number | null };
  onSaved?: () => void;
}) {
  const t = useT(commonMessages);
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [line1, setLine1] = useState(initial.line1 ?? '');
  const [city, setCity] = useState(initial.city ?? '');
  const [state, setState] = useState(initial.state ?? '');
  const [zip, setZip] = useState(initial.zip ?? '');
  const [notes, setNotes] = useState(initial.notes ?? '');
  const [bedrooms, setBedrooms] = useState(initial.bedrooms ? String(initial.bedrooms) : '');
  const [picked, setPicked] = useState<PickedAddress | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle');
  const [error, setError] = useState('');

  function onPick(address: PickedAddress | null) {
    setPicked(address);
    if (address) {
      setLine1(address.line1);
      setCity(address.city);
      setState(address.state);
      setZip(address.zip);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('saving');
    setError('');
    const res = await fetch(endpoint, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ line1, city, state, zip, notes, bedrooms: bedrooms ? Number(bedrooms) : null }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setStatus('idle');
      setEditing(false);
      router.refresh();
      onSaved?.();
    } else {
      setStatus('error');
      setError(data.error || t('saveError'));
    }
  }

  if (!editing) {
    return (
      <div className="flex items-start justify-between gap-4">
        <div className="text-sm text-slate">
          {initial.line1 ? (
            <>
              <p className="font-medium text-ink">{initial.line1}</p>
              <p>
                {initial.city}, {initial.state} {initial.zip}
              </p>
              {initial.notes && (
                <p className="mt-2 rounded-lg bg-gold/10 px-3 py-2 text-xs text-ink">
                  <span className="font-semibold text-bronze">{t('addrCleanerNeedsToKnowPrefix')}</span>
                  {initial.notes}
                </p>
              )}
            </>
          ) : (
            <p className="text-muted">{t('addrNone')}</p>
          )}
        </div>
        <button onClick={() => setEditing(true)} className="btn-secondary !px-4 !py-2 text-sm">
          {initial.line1 ? t('addrEdit') : t('addrAdd')}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <label className="label">{t('addrStreet')}</label>
        <AddressInput value={line1} onChange={setLine1} picked={picked} onPick={onPick} required />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-1">
          <label className="label">{t('addrCity')}</label>
          <input className="input" value={city} onChange={(e) => setCity(e.target.value)} required />
        </div>
        <div>
          <label className="label">{t('addrState')}</label>
          <input className="input" value={state} onChange={(e) => setState(e.target.value)} maxLength={2} required />
        </div>
        <div>
          <label className="label">{t('addrZip')}</label>
          <input className="input" value={zip} onChange={(e) => setZip(e.target.value)} />
        </div>
      </div>
      <div>
        <label className="label">{t('addrBedrooms')}</label>
        <select className="input" value={bedrooms} onChange={(e) => setBedrooms(e.target.value)}>
          <option value="">{t('addrNotSet')}</option>
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <option key={n} value={n}>
              {n} {n === 6 ? '+' : ''}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-muted">{t('addrBedroomsHelp')}</p>
      </div>
      <div>
        <label className="label">{t('addrCleanerNeedsToKnow')}</label>
        <textarea
          className="input"
          rows={3}
          placeholder={t('addrNotesPlaceholder')}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <p className="mt-1 text-xs text-muted">{t('addrNotesHelp')}</p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={status === 'saving'} className="btn-primary !px-4 !py-2 text-sm">
          {status === 'saving' ? t('saving') : t('addrSave')}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="btn-secondary !px-4 !py-2 text-sm"
          disabled={status === 'saving'}
        >
          {t('cancel')}
        </button>
      </div>
    </form>
  );
}
