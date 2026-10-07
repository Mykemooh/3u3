'use client';

import { useState } from 'react';
import { useT } from '@/components/i18n/LocaleProvider';
import { commonMessages } from '@/lib/i18n/messages/common';

/** Makes (or reuses) the proof-of-clean link and copies it. */
export default function ShareProofButton({ jobId }: { jobId: string }) {
  const t = useT(commonMessages);
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  async function go() {
    setError('');
    const res = await fetch(`/api/account/jobs/${jobId}/proof`, { method: 'POST' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setError(body.error ?? t('proofError'));
    setUrl(body.url);
    try {
      await navigator.clipboard.writeText(body.url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className="text-sm">
      <button type="button" onClick={go} className="font-semibold text-bronze hover:underline">
        {copied ? t('proofCopied') : t('proofShare')}
      </button>
      {url && !copied && <p className="mt-1 break-all text-xs text-muted">{url}</p>}
      {url && (
        <a href={url} target="_blank" rel="noreferrer" className="ml-3 text-xs text-muted hover:text-ink">{t('proofOpen')}</a>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
