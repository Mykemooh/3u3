import { NextResponse } from 'next/server';
import { staffUser, staffHome } from '@/lib/staffSession';
import { connectCalendar } from '@/lib/googleCalendar';
import { appUrl } from '@/lib/url';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const user = await staffUser();
  const url = new URL(req.url);
  const home = staffHome(user?.role ?? 'CLEANER');
  const back = (q: string) => {
    const res = NextResponse.redirect(appUrl(`${home}?${q}`));
    res.cookies.delete({ name: 'gcal_oauth_state', path: '/api/calendar/google' });
    return res;
  };
  if (!user) return NextResponse.redirect(appUrl('/signin'));
  const state = url.searchParams.get('state');
  const expected = req.headers.get('cookie')?.match(/gcal_oauth_state=([^;]+)/)?.[1];
  if (url.searchParams.get('error')) return back(`error=${encodeURIComponent('Google Calendar was not connected.')}`);
  const code = url.searchParams.get('code');
  if (!code || !state || state !== expected || !state.startsWith(`${user.id}.`)) {
    return back(`error=${encodeURIComponent('That connection link expired. Please try again.')}`);
  }
  try {
    await connectCalendar({ id: user.id, tenantId: user.tenantId, name: user.name }, code);
  } catch (err) {
    console.error('[calendar] connect failed', err);
    return back(`error=${encodeURIComponent('Could not finish connecting Google Calendar.')}`);
  }
  return back(`connected=${encodeURIComponent('Google Calendar')}`);
}
