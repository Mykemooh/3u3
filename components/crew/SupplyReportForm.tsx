'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@/components/i18n/LocaleProvider';
import { crewMessages } from '@/lib/i18n/messages/crew';

const STATUS_OPTIONS = [
  { value: 'LOW', label: 'supplyLow' },
  { value: 'OUT', label: 'supplyOut' },
  { value: 'DAMAGED', label: 'supplyDamaged' },
] as const;

export default function SupplyReportForm() {
  const router = useRouter();
  const t = useT(crewMessages);
  const [productName, setProductName] = useState('');
  const [status, setStatus] = useState<'LOW' | 'OUT' | 'DAMAGED'>('LOW');
  const [notes, setNotes] = useState('');
  const [state, setState] = useState<'idle' | 'saving' | 'sent' | 'error'>('idle');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState('saving');
    const res = await fetch('/api/crew/supplies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productName, status, notes: notes.trim() || undefined }),
    });
    if (res.ok) {
      setProductName('');
      setNotes('');
      setStatus('LOW');
      setState('sent');
      router.refresh();
    } else {
      setState('error');
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className="label">{t('supplyProduct')}</label>
        <input
          className="input"
          value={productName}
          onChange={(e) => setProductName(e.target.value)}
          placeholder={t('supplyProductPlaceholder')}
          required
        />
      </div>
      <div>
        <label className="label">{t('supplyWhat')}</label>
        <div className="grid grid-cols-3 gap-2">
          {STATUS_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setStatus(o.value)}
              className={`rounded-xl border-2 px-3 py-2 text-center text-sm font-medium transition ${
                status === o.value ? 'border-gold bg-gold/10' : 'border-line hover:border-gold'
              }`}
            >
              {t(o.label)}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="label">{t('supplyNotes')}</label>
        <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('supplyNotesPlaceholder')} />
      </div>
      <button type="submit" disabled={state === 'saving'} className="btn-primary w-full">
        {state === 'saving' ? t('supplySending') : t('supplyNotify')}
      </button>
      {state === 'sent' && <p className="text-center text-sm font-semibold text-bronze">{t('supplySent')}</p>}
      {state === 'error' && <p className="text-center text-sm text-red-600">{t('supplyError')}</p>}
    </form>
  );
}
