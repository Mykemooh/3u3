import { NextResponse } from 'next/server';
import { adminTenant, forbidden } from '@/lib/adminApi';
import { billingPortal } from '@/lib/billing/stripeBilling';
import { billingError } from '../_respond';

/** Stripe's billing portal: card on file and TRASHCAN invoices. */
export async function POST() {
  const tenantId = await adminTenant();
  if (!tenantId) return forbidden();
  try {
    return NextResponse.json(await billingPortal(tenantId));
  } catch (err) {
    return billingError(err);
  }
}
