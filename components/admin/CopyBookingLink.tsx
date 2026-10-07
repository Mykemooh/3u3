'use client';

import { useState } from 'react';

/** Copies the booking link and ticks "Share your booking link" in the setup guide. */
export default function CopyBookingLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // Clipboard blocked (http, old browser): the link is right there to select.
    }
    setCopied(true);
    fetch('/api/admin/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'booking-shared', skip: true }) }).catch(() => {});
    setTimeout(() => setCopied(false), 2500);
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className="min-w-0 flex-1 break-all rounded-xl bg-surface px-4 py-3 font-mono text-sm text-ink">{link}</p>
      <button type="button" onClick={copy} className="btn-secondary btn-sm" aria-live="polite">
        {copied ? 'Copied' : 'Copy link'}
      </button>
    </div>
  );
}
