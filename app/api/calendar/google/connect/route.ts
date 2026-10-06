import { NextResponse } from 'next/server';
import { staffUser } from '@/lib/staffSession';
import { appUrl } from '@/lib/url';
import { authorizeUrl, calendarConfigured, newOAuthState } from '@/lib/googleCalendar';

export const dynamic = 'force-dynamic';

/**
 * "Connect Google Calendar" — for the signed-in staff member themselves.
 * The state (user id + nonce) rides in a short-lived cookie and is checked
 * on the way back in callback/route.ts.
 */
export async function GET() {
  const user = await staffUser();
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 403 });
  if (!calendarConfigured()) return NextResponse.json({ error: 'Google Calendar is not set up for this site yet.' }, { status: 400 });
  const state = `${user.id}.${newOAuthState()}`;
  const res = NextResponse.redirect(authorizeUrl(state));
  res.cookies.set('gcal_oauth_state', state, { httpOnly: true, secure: appUrl('/').startsWith('https'), maxAge: 600, sameSite: 'lax', path: '/api/calendar/google' });
  return res;
}
