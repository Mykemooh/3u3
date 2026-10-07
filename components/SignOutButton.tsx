'use client';

import { signOut } from 'next-auth/react';
import { useT } from '@/components/i18n/LocaleProvider';
import { shellMessages } from '@/lib/i18n/messages/shell';

export default function SignOutButton() {
  const t = useT(shellMessages);
  return (
    <button
      onClick={() => signOut({ callbackUrl: '/' })}
      className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-semibold text-white/80 hover:border-gold hover:text-gold"
    >
      {t('signOut')}
    </button>
  );
}
