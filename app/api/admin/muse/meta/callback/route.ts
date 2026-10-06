import { NextResponse } from 'next/server';
import { adminSession } from '@/lib/adminApi';
import { connectMeta } from '@/lib/meta';
import { readCookie } from '@/lib/companyConnections';
import { appUrl } from '@/lib/url';

export async function GET(req: Request) {
  const admin = await adminSession('marketing.manage');
  const url = new URL(req.url);
  const back = (q: string) => {
    const res = NextResponse.redirect(appUrl(`/admin/marketing/muse?${q}`));
    res.cookies.delete('meta_oauth_state');
    return res;
  };
  if (!admin) return back(`error=${encodeURIComponent('Please sign in as an admin and try again.')}`);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const expected = readCookie(req, 'meta_oauth_state');
  if (!code || !state || state !== expected || !state.startsWith(`${admin.tenantId}.`)) return back(`error=${encodeURIComponent('That connection link expired. Please try again.')}`);
  try {
    await connectMeta(admin.tenantId, admin.userId, code, { id: admin.userId, name: admin.name });
  } catch (err) {
    console.error('[meta] connect failed', err);
    return back(`error=${encodeURIComponent('Could not finish connecting Facebook.')}`);
  }
  return back('connected=1');
}
