'use client';

import { useState } from 'react';

/** The client's own referral link, with copy and the phone's share sheet. */
export default function ReferralLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  async function share() {
    const data = { title: 'My cleaning crew', text: 'This is who cleans our home — book a free walkthrough with my link:', url: link };
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share(data);
        return;
      } catch {
        // cancelled — fall through to copy
      }
    }
    await navigator.clipboard?.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-lg bg-surface px-3 py-2 text-xs text-slate">{link}</code>
      <button type="button" onClick={share} className="btn-primary !px-4 !py-2 text-sm">
        {copied ? 'Copied' : 'Share link'}
      </button>
    </div>
  );
}
