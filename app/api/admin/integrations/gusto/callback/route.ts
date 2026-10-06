import { NextResponse } from 'next/server';
import { adminSession } from '@/lib/adminApi';
import { connectGusto } from '@/lib/gusto';
import { oauthCookie, readCookie } from '@/lib/companyConnections';
import { appUrl } from '@/lib/url';

export async function GET(req: Request) {
  const admin = await adminSession();
  const url = new URL(req.url);
  const back = (q: string) => {
    const res = NextResponse.redirect(appUrl(`/admin/integrations?${q}#gusto`));
    res.cookies.delete(oauthCookie('GUSTO'));
    return res;
  };
  if (!admin) return back(`error=${encodeURIComponent('Please sign in as an admin and try again.')}`);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const expected = readCookie(req, oauthCookie('GUSTO'));
  if (!code || !state || state !== expected || !state.startsWith(`${admin.tenantId}.`)) {
    return back(`error=${encodeURIComponent('That connection link expired. Please try again.')}`);
  }
  try {
    await connectGusto(admin.tenantId, code, { id: admin.userId, name: admin.name });
  } catch (err) {
    console.error('[gusto] connect failed', err);
    return back(`error=${encodeURIComponent('Could not finish connecting Gusto.')}`);
  }
  return back(`connected=${encodeURIComponent('Gusto')}`);
}
