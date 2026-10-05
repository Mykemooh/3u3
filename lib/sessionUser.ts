import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';

export type SessionUser = {
  id: string;
  name: string;
  email?: string | null;
  role: 'ADMIN' | 'CLEANER' | 'CUSTOMER' | 'SUPER_ADMIN';
  tenantId: string;
  mfaPending: boolean;
  mfaSetup: 'required' | 'prompt' | null;
  mfaLocked: boolean;
};

export async function sessionUser(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions).catch(() => null);
  const u = session?.user as SessionUser | undefined;
  return u?.id ? u : null;
}

/**
 * The authoritative second-step check for server-rendered portal pages
 * (the middleware's is a fast first pass). Sends anyone who hasn't
 * finished two-step sign-in to the right screen.
 */
export function enforceMfa(user: SessionUser | null, next: string) {
  if (!user) return;
  if (user.mfaLocked) redirect('/signin?error=MfaLocked');
  if (user.mfaPending) redirect(`/mfa?next=${encodeURIComponent(next)}`);
  if (user.mfaSetup === 'required') redirect(`/mfa/setup?next=${encodeURIComponent(next)}`);
}
