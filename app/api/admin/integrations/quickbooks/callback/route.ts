import { NextResponse } from 'next/server';
import { adminTenant } from '@/lib/adminApi';
import { connectQuickbooks } from '@/lib/quickbooks';
import { appUrl } from '@/lib/url';

export async function GET(req: Request) {
  const tenantId = await adminTenant();
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const realmId = url.searchParams.get('realmId');
  const state = url.searchParams.get('state');
  const expectedState = req.headers.get('cookie')?.match(/qb_oauth_state=([^;]+)/)?.[1];

  const fail = (reason: string) => NextResponse.redirect(appUrl(`/admin/integrations?qb_error=${encodeURIComponent(reason)}`));

  if (!tenantId) return fail('Please sign in as an admin and try again.');
  if (!code || !realmId || !state) return fail('QuickBooks did not return everything needed to connect.');
  if (!expectedState || state !== expectedState || !state.startsWith(`${tenantId}.`)) {
    return fail('That connection link expired or was not recognized — please try connecting again.');
  }

  try {
    await connectQuickbooks(tenantId, code, realmId);
  } catch (err) {
    console.error('[quickbooks] connect failed', err);
    return fail('Could not finish connecting to QuickBooks.');
  }

  const res = NextResponse.redirect(appUrl('/admin/integrations?qb_connected=1'));
  res.cookies.delete('qb_oauth_state');
  return res;
}
