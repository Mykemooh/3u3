'use client';

import { useState } from 'react';
import { useT } from '@/components/i18n/LocaleProvider';
import { accountMessages } from '@/lib/i18n/messages/account';

/** "Anything not quite right?" — tell the team, who offer to come back. */
export default function ReportProblem({ jobId }: { jobId: string }) {
  const t = useT(accountMessages);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (note.trim().length < 3) {
      setStatus('error');
      setError(t('problemNoteRequired'));
      return;
    }
    setStatus('saving');
    setError('');
    const res = await fetch(`/api/account/jobs/${jobId}/problem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note }),
    }).catch(() => null);
    if (!res?.ok) {
      setStatus('error');
      setError(t('problemError'));
      return;
    }
    setStatus('done');
  }

  return (
    <div className="card text-center">
      <h2 className="ct-h3">{t('jobNotRight')}</h2>
      {status === 'done' ? (
        <p role="status" className="mx-auto mt-3 max-w-sm rounded-xl bg-cream px-4 py-3 text-[15px] text-ink">
          {t('problemSent')}
        </p>
      ) : !open ? (
        <>
          <p className="mx-auto mt-1 max-w-[42ch] text-[15px] text-slate">{t('jobNotRightHelp')}</p>
          <button type="button" onClick={() => setOpen(true)} className="btn-secondary mt-4">
            {t('problemOpen')}
          </button>
        </>
      ) : (
        <form onSubmit={send} className="mx-auto mt-3 max-w-sm space-y-3 text-left">
          <label className="block">
            <span className="label">{t('problemLabel')}</span>
            <textarea
              className="input w-full"
              rows={4}
              autoFocus
              maxLength={2000}
              placeholder={t('problemPlaceholder')}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          {status === 'error' && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={status === 'saving'} className="btn-primary flex-1">
              {status === 'saving' ? t('problemSending') : t('problemSend')}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary">
              {t('problemCancel')}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
