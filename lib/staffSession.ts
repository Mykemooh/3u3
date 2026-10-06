import { sessionUser } from '@/lib/sessionUser';

/** A signed-in staff member (office or crew) who has finished two-step sign-in, or null. */
export async function staffUser() {
  const u = await sessionUser();
  if (!u || (u.role !== 'ADMIN' && u.role !== 'CLEANER')) return null;
  if (u.mfaPending || u.mfaLocked || u.mfaSetup === 'required') return null;
  return u;
}

/** Where a staff member goes back to after connecting something for themselves. */
export const staffHome = (role: string) => (role === 'ADMIN' ? '/admin/integrations' : '/crew');
