import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminTenant, forbidden } from '@/lib/adminApi';
import { startTopUp } from '@/lib/billing/stripeBilling';
import { billingError } from '../_respond';

const schema = z.object({ cents: z.number().int() });

/** Add credits by card (Stripe Checkout). Credits land when Stripe confirms the payment. */
export async function POST(req: Request) {
  const tenantId = await adminTenant();
  if (!tenantId) return forbidden();
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Pick an amount.' }, { status: 400 });
  try {
    return NextResponse.json(await startTopUp(tenantId, parsed.data.cents));
  } catch (err) {
    return billingError(err);
  }
}
