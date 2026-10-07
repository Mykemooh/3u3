'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useT } from '@/components/i18n/LocaleProvider';
import { shellMessages } from '@/lib/i18n/messages/shell';

function Notice() {
  const denied = useSearchParams().get('denied');
  const t = useT(shellMessages);
  if (!denied) return null;
  return (
    <div className="mb-6 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
      {t('denied')}
    </div>
  );
}

/**
 * Explains the redirect when the middleware sends someone here because the
 * page they asked for isn't theirs. Silent redirects are what made the old
 * sign-in loop so hard to diagnose.
 */
export default function AccessNotice() {
  return (
    <Suspense>
      <Notice />
    </Suspense>
  );
}
