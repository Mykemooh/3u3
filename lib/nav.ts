export const signOutLink = '/api/auth/signout';

export type Role = 'ADMIN' | 'CLEANER' | 'CUSTOMER';

/**
 * Where a signed-in person belongs. One definition, used by both the
 * sign-in page and the middleware — when those two disagree about where
 * someone should land, you get a redirect loop with no error message,
 * which is exactly the trap this replaced.
 */
export function homeForRole(role?: string | null): string {
  if (role === 'ADMIN') return '/admin';
  if (role === 'CLEANER') return '/crew';
  return '/book';
}

/** Whether a role may open a given path. Admins can see everything. */
export function canAccess(role: string | null | undefined, pathname: string): boolean {
  if (!role) return false;
  if (role === 'ADMIN') return true;
  if (pathname.startsWith('/admin')) return false;
  if (pathname.startsWith('/crew')) return role === 'CLEANER';
  if (pathname.startsWith('/book')) return role === 'CUSTOMER';
  return true;
}
