import { NextResponse } from 'next/server';
import { adminTenant, forbidden } from '@/lib/adminApi';
import { startTextingSetup } from '@/lib/billing/stripeBilling';
import { billingError } from '../_respond';

/** The one-time texting setup (business number + carrier registration). */
export async function POST() {
  const tenantId = await adminTenant();
  if (!tenantId) return forbidden();
  try {
    return NextResponse.json(await startTextingSetup(tenantId));
  } catch (err) {
    return billingError(err);
  }
}
