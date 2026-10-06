import { NextResponse } from 'next/server';
import { adminSession, forbidden } from '@/lib/adminApi';
import { metaAuthorizeUrl, metaConfigured } from '@/lib/meta';
import { randomToken } from '@/lib/secretBox';
import { appUrl } from '@/lib/url';

export async function GET() {
  const admin = await adminSession('marketing.manage');
  if (!admin) return forbidden();
  if (!metaConfigured()) return NextResponse.json({ error: 'Facebook ads are not set up for this site yet.' }, { status: 400 });
  const state = `${admin.tenantId}.${randomToken('', 16)}`;
  const res = NextResponse.redirect(metaAuthorizeUrl(state));
  res.cookies.set('meta_oauth_state', state, { httpOnly: true, secure: appUrl('/').startsWith('https'), maxAge: 600, sameSite: 'lax' });
  return res;
}
