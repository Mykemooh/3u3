import { NextResponse } from 'next/server';
import { adminSession, forbidden } from '@/lib/adminApi';
import { gustoAuthorizeUrl, gustoConfigured } from '@/lib/gusto';
import { oauthCookie } from '@/lib/companyConnections';
import { randomToken } from '@/lib/secretBox';
import { appUrl } from '@/lib/url';

export async function GET() {
  const admin = await adminSession();
  if (!admin) return forbidden();
  if (!gustoConfigured()) return NextResponse.json({ error: 'Gusto is not set up for this site yet.' }, { status: 400 });
  const state = `${admin.tenantId}.${randomToken('', 16)}`;
  const res = NextResponse.redirect(gustoAuthorizeUrl(state));
  res.cookies.set(oauthCookie('GUSTO'), state, { httpOnly: true, secure: appUrl('/').startsWith('https'), maxAge: 600, sameSite: 'lax' });
  return res;
}
