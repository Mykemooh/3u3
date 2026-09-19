import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';
import { homeForRole, canAccess } from '@/lib/nav';

/**
 * Two different situations that used to produce the same dead end:
 *
 *  - Nobody is signed in  -> send them to sign in, remembering where they
 *    were headed so they land there afterwards.
 *  - Someone IS signed in, just not as a role that can open this page ->
 *    send them to their own home area, not back to the sign-in form. A
 *    cleaner who opens an admin link should see their jobs, not a login
 *    screen that looks like it rejected their password.
 */
export default withAuth(
  function middleware(req) {
    const { pathname, search } = req.nextUrl;
    const role = (req.nextauth.token as any)?.role as string | undefined;

    if (canAccess(role, pathname)) return NextResponse.next();

    if (!role) {
      const signin = new URL('/signin', req.url);
      signin.searchParams.set('next', `${pathname}${search}`);
      return NextResponse.redirect(signin);
    }

    const home = new URL(homeForRole(role), req.url);
    home.searchParams.set('denied', '1');
    return NextResponse.redirect(home);
  },
  {
    callbacks: {
      // Let the function above decide — it can tell "signed out" apart from
      // "signed in as the wrong role", which this callback cannot.
      authorized: () => true,
    },
  },
);

export const config = {
  matcher: ['/admin/:path*', '/crew/:path*', '/book/:path*'],
};
