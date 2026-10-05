import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import type { Audience } from '@/lib/help/content';

/** Who is reading the public help pages: a signed-in client also sees client-only articles. */
export async function publicHelpAudience(): Promise<Audience> {
  const user = (await getServerSession(authOptions).catch(() => null))?.user as { role?: string; mfaPending?: boolean } | undefined;
  return user?.role === 'CUSTOMER' && !user.mfaPending ? 'CLIENT' : 'PUBLIC';
}
