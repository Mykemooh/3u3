import { NextResponse } from 'next/server';

/**
 * A client's referral link. Remembers the code for 60 days and sends the
 * visitor to the walkthrough request; app/api/leads reads the cookie when
 * the new client is created (lib/referrals.ts recordReferral).
 */
export function GET(req: Request, { params }: { params: { code: string } }) {
  const code = params.code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  const res = NextResponse.redirect(new URL('/new', req.url));
  if (code) res.cookies.set('ref', code, { maxAge: 60 * 60 * 24 * 60, httpOnly: true, sameSite: 'lax', path: '/' });
  return res;
}
