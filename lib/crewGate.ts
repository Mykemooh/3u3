import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { enforceMfa, type SessionUser } from '@/lib/sessionUser';
import { homeForRole } from '@/lib/nav';

/** Crew-only pages: signed in, a cleaner (or an admin checking what crews see), MFA done. */
export async function crewSession(next: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect(`/signin?next=${encodeURIComponent(next)}`);
  const user = session.user as unknown as SessionUser & { id: string; role?: string; name?: string | null };
  if (user.role !== 'CLEANER' && user.role !== 'ADMIN') redirect(`${homeForRole(user.role)}?denied=1`);
  enforceMfa(user, next);
  return user;
}
