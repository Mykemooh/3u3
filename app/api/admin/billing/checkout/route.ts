import { NextResponse } from 'next/server';
import { adminTenant, forbidden } from '@/lib/adminApi';
import { createPlatformCheckoutSession, PlatformError } from '@/lib/platform';

export async function POST() {
  const tenantId = await adminTenant();
  if (!tenantId) return forbidden();
  try {
    const { url } = await createPlatformCheckoutSession(tenantId);
    return NextResponse.json({ url });
  } catch (err) {
    if (err instanceof PlatformError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error('[billing] checkout failed', err);
    return NextResponse.json({ error: 'Could not start checkout. Please try again.' }, { status: 500 });
  }
}
