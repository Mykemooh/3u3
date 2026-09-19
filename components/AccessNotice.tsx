'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function Notice() {
  const denied = useSearchParams().get('denied');
  if (!denied) return null;
  return (
    <div className="mb-6 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
      That page is for a different kind of account, so we've brought you back to yours.
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
