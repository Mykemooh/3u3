'use client';

import { useState } from 'react';
import { useT } from '@/components/i18n/LocaleProvider';
import { accountMessages } from '@/lib/i18n/messages/account';

/** The client's own referral link, with copy and the phone's share sheet. */
export default function ReferralLink({ link }: { link: string }) {
  const t = useT(accountMessages);
  const [copied, setCopied] = useState(false);
  async function share() {
    const data = { title: t('referShareTitle'), text: t('referShareText'), url: link };
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
      <span className="min-w-0 flex-1 truncate rounded-lg bg-surface px-3 py-2.5 text-sm text-slate">{link}</span>
      <button type="button" onClick={share} className="btn-primary btn-sm min-h-[44px]">
        {copied ? t('referCopied') : t('referShare')}
      </button>
    </div>
  );
}
