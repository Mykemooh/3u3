'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@/components/i18n/LocaleProvider';
import { accountMessages } from '@/lib/i18n/messages/account';

/** "Add a note for the team" on the next visit — the crew sees it on their visit card. */
export default function TeamNoteButton({ bookingId, initial }: { bookingId: string; initial: string | null }) {
  const t = useT(accountMessages);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(initial ?? '');
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="block text-left font-semibold text-bronze hover:underline">
        {initial ? t('noteEdit') : t('noteAdd')}
      </button>
    );
  }
  return (
    <form
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setState('saving');
        const res = await fetch(`/api/account/bookings/${bookingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'note', note }),
        });
        setState(res.ok ? 'saved' : 'error');
        if (res.ok) {
          setOpen(false);
          router.refresh();
        }
      }}
    >
      <textarea className="input min-h-[70px] !py-2 text-sm" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('notePlaceholder')} />
      <div className="flex gap-3">
        <button className="btn-primary btn-sm" disabled={state === 'saving'}>{t('noteSave')}</button>
        <button type="button" className="text-sm text-muted" onClick={() => setOpen(false)}>{t('cancel')}</button>
      </div>
      {state === 'error' && <p className="text-xs text-red-600">{t('noteError')}</p>}
    </form>
  );
}
