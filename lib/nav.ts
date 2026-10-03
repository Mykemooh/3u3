export const signOutLink = '/api/auth/signout';

export type Role = 'ADMIN' | 'CLEANER' | 'CUSTOMER' | 'SUPER_ADMIN';

/**
 * Where a signed-in person belongs. One definition, used by both the
 * sign-in page and the middleware — when those two disagree about where
 * someone should land, you get a redirect loop with no error message,
 * which is exactly the trap this replaced.
 */
export function homeForRole(role?: string | null): string {
  if (role === 'SUPER_ADMIN') return '/platform';
  if (role === 'ADMIN') return '/admin';
  if (role === 'CLEANER') return '/crew';
  return '/account';
}

/**
 * Whether a role may open a given path. Admins can see everything in
 * their own company; SUPER_ADMIN is the platform owner — a different,
 * narrower concern (Admin → Platform only), not a superset of ADMIN.
 */
export function canAccess(role: string | null | undefined, pathname: string): boolean {
  if (!role) return false;
  if (role === 'SUPER_ADMIN') return pathname.startsWith('/platform');
  if (pathname.startsWith('/platform')) return false;
  if (role === 'ADMIN') return true;
  if (pathname.startsWith('/admin')) return false;
  if (pathname.startsWith('/crew')) return role === 'CLEANER';
  if (pathname.startsWith('/book')) return role === 'CUSTOMER';
  if (pathname.startsWith('/account')) return role === 'CUSTOMER';
  return true;
}
