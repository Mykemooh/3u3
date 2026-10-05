import { NextResponse } from 'next/server';
import { sessionUser } from '@/lib/sessionUser';
import { makeTrustCookie, TRUST_COOKIE } from '@/lib/mfa';

/** "Remember this device for 30 days" — only after the code was accepted. */
export async function POST() {
  const user = await sessionUser();
  if (!user || user.mfaPending) return NextResponse.json({ error: 'Finish signing in first.' }, { status: 401 });
  const { value, maxAge } = makeTrustCookie(user.id);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(TRUST_COOKIE, value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge,
    path: '/',
  });
  return res;
}
