import { redirect } from 'next/navigation';
import { sessionUser } from '@/lib/sessionUser';
import { canAccess, homeForRole } from '@/lib/nav';

export const dynamic = 'force-dynamic';

/**
 * Where Google sign-in lands: sends the person to the second step if they
 * need it, otherwise to where they were going or their own portal.
 */
export default async function MfaCheck({ searchParams }: { searchParams: { next?: string } }) {
  const user = await sessionUser();
  if (!user) redirect('/signin');
  const target = searchParams.next && canAccess(user.role, searchParams.next) ? searchParams.next : homeForRole(user.role);
  if (user.mfaPending) redirect(`/mfa?next=${encodeURIComponent(target)}`);
  if (user.mfaSetup) redirect(`/mfa/setup?${user.mfaSetup === 'prompt' ? 'optional=1&' : ''}next=${encodeURIComponent(target)}`);
  redirect(target);
}
