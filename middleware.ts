import { NextResponse, type NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { homeForRole, canAccess } from '@/lib/nav';

/**
 * Access control at the edge — written against getToken directly rather
 * than next-auth's withAuth wrapper, for one specific reason.
 *
 * withAuth calls getToken without saying which cookie to read, so getToken
 * falls back to guessing from the environment (next-auth/jwt, v4):
 *
 *     secureCookie = process.env.NEXTAUTH_URL?.startsWith("https://")
 *                      ?? !!process.env.VERCEL
 *     cookieName   = secureCookie ? "__Secure-next-auth.session-token"
 *                                 : "next-auth.session-token"
 *
 * On HTTPS the browser holds `__Secure-next-auth.session-token`. But if
 * NEXTAUTH_URL is set to anything that doesn't literally begin "https://"
 * — a bare hostname, or http:// — that first branch evaluates false, the
 * `??` never fires, and the middleware hunts for the unprefixed cookie
 * name. It finds nothing, decides nobody is signed in, and redirects to
 * the sign-in page. Meanwhile /api/auth/session, which runs in Node and
 * reads the cookie directly, happily reports a valid session. The result
 * is a signed-in user bounced off every protected page with no error
 * anywhere — for every role, indefinitely.
 *
 * So: derive it from the request actually in hand. A request that arrived
 * over https has the secure cookie, whatever any environment variable
 * claims.
 *
 * And because this runs before the page and can only ever guess, it now
 * fails OPEN rather than closed: if a session cookie is present but can't
 * be decoded here, the request is passed through to the page, whose
 * getServerSession runs in Node and is authoritative. Every protected area
 * enforces its own access (see app/admin/layout.tsx, app/crew, app/book),
 * so passing through costs nothing — and it makes a silent redirect loop
 * structurally impossible.
 */

const SESSION_COOKIES = ['__Secure-next-auth.session-token', 'next-auth.session-token'];

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  const secureCookie = req.nextUrl.protocol === 'https:';
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
    secureCookie,
  });

  const role = (token as { role?: string } | null)?.role;

  if (canAccess(role, pathname)) return NextResponse.next();

  if (!role) {
    // Is there a session cookie we simply couldn't read? Then this is our
    // problem, not the visitor's — let the page decide rather than bounce
    // them somewhere they've already been.
    const hasSessionCookie = SESSION_COOKIES.some((name) => req.cookies.has(name));
    if (hasSessionCookie) return NextResponse.next();

    const signin = new URL('/signin', req.url);
    signin.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(signin);
  }

  // Signed in, just not as a role that can open this page. Send them to
  // their own area with something to read, never back to a login form.
  const home = new URL(homeForRole(role), req.url);
  home.searchParams.set('denied', '1');
  return NextResponse.redirect(home);
}

export const config = {
  matcher: ['/admin/:path*', '/crew/:path*', '/book/:path*'],
};
