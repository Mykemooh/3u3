'use client';

import { signOut } from 'next-auth/react';

export default function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: '/' })}
      className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-semibold text-white/80 hover:border-gold hover:text-gold"
    >
      Sign out
    </button>
  );
}
