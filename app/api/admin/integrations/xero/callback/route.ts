import { NextResponse } from 'next/server';
import { adminSession } from '@/lib/adminApi';
import { connectXero } from '@/lib/xero';
import { oauthCookie, readCookie } from '@/lib/companyConnections';
import { appUrl } from '@/lib/url';

export async function GET(req: Request) {
  const admin = await adminSession();
  const url = new URL(req.url);
  const back = (q: string) => {
    const res = NextResponse.redirect(appUrl(`/admin/integrations?${q}#xero`));
    res.cookies.delete(oauthCookie('XERO'));
    return res;
  };
  if (!admin) return back(`error=${encodeURIComponent('Please sign in as an admin and try again.')}`);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const expected = readCookie(req, oauthCookie('XERO'));
  if (!code || !state || state !== expected || !state.startsWith(`${admin.tenantId}.`)) {
    return back(`error=${encodeURIComponent('That connection link expired. Please try again.')}`);
  }
  try {
    await connectXero(admin.tenantId, code, { id: admin.userId, name: admin.name });
  } catch (err) {
    console.error('[xero] connect failed', err);
    return back(`error=${encodeURIComponent('Could not finish connecting Xero.')}`);
  }
  return back(`connected=${encodeURIComponent('Xero')}`);
}
