import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminTenant, forbidden } from '@/lib/adminApi';
import { setAutoTopUp, getWallet } from '@/lib/billing/wallet';
import { billingError } from '../_respond';

const schema = z.object({ enabled: z.boolean(), amountCents: z.number().int().optional(), thresholdCents: z.number().int().optional() });

export async function POST(req: Request) {
  const tenantId = await adminTenant();
  if (!tenantId) return forbidden();
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Check the amounts and try again.' }, { status: 400 });
  try {
    if (parsed.data.enabled && !(await getWallet(tenantId)).defaultPaymentMethodId) {
      return NextResponse.json({ error: 'Add credits by card once first — that saves the card auto top-up uses.' }, { status: 400 });
    }
    await setAutoTopUp(tenantId, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return billingError(err);
  }
}
