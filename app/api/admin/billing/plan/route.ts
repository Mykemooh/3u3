import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminTenant, forbidden } from '@/lib/adminApi';
import { changePlan } from '@/lib/billing/stripeBilling';
import { billingError } from '../_respond';

const schema = z.object({ plan: z.enum(['FREE', 'CREW', 'TEAM']) });

/** Settings → Plan & credits → change plan. */
export async function POST(req: Request) {
  const tenantId = await adminTenant();
  if (!tenantId) return forbidden();
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Pick a plan.' }, { status: 400 });
  try {
    return NextResponse.json(await changePlan(tenantId, parsed.data.plan));
  } catch (err) {
    return billingError(err);
  }
}
