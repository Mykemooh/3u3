import { NextResponse } from 'next/server';
import { adminSession, forbidden } from '@/lib/adminApi';
import { xeroAuthorizeUrl, xeroConfigured } from '@/lib/xero';
import { oauthCookie } from '@/lib/companyConnections';
import { randomToken } from '@/lib/secretBox';
import { appUrl } from '@/lib/url';

export async function GET() {
  const admin = await adminSession();
  if (!admin) return forbidden();
  if (!xeroConfigured()) return NextResponse.json({ error: 'Xero is not set up for this site yet.' }, { status: 400 });
  const state = `${admin.tenantId}.${randomToken('', 16)}`;
  const res = NextResponse.redirect(xeroAuthorizeUrl(state));
  res.cookies.set(oauthCookie('XERO'), state, { httpOnly: true, secure: appUrl('/').startsWith('https'), maxAge: 600, sameSite: 'lax' });
  return res;
}
