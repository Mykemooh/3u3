import { NextResponse } from 'next/server';
import { adminTenant } from '@/lib/adminApi';
import { authorizeUrl, newState, quickbooksConfigured, QuickbooksError } from '@/lib/quickbooks';

// Admin → Integrations → "Connect QuickBooks". Redirects to Intuit's own
// consent screen; state carries the tenant id (checked again on the way
// back in callback/route.ts) plus a random nonce, stored in a short-lived
// cookie so the callback can confirm this redirect round-trip wasn't
// forged.
export async function GET() {
  const tenantId = await adminTenant();
  if (!tenantId) return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  if (!quickbooksConfigured()) {
    return NextResponse.json({ error: 'QuickBooks is not configured for this deployment yet.' }, { status: 400 });
  }

  const nonce = newState();
  const state = `${tenantId}.${nonce}`;
  try {
    const res = NextResponse.redirect(authorizeUrl(state));
    res.cookies.set('qb_oauth_state', state, { httpOnly: true, maxAge: 600, sameSite: 'lax' });
    return res;
  } catch (err) {
    if (err instanceof QuickbooksError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
