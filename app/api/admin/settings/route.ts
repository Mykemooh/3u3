import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db/client';
import { tenants } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { adminTenant, forbidden } from '@/lib/adminApi';

const schema = z.object({
  percentPayBasis: z.enum(['BASE_PRICE', 'INVOICE_TOTAL']).optional(),
  hourlyPayModel: z.enum(['ACTUAL_TIME', 'TARGET_TIME']).optional(),
  tipSplitMethod: z.enum(['EVEN', 'BY_HOURS']).optional(),
});

// Admin-configurable payroll behavior (lib/payroll.ts PayrollSettings) —
// decisions the code used to make for everyone are settings an owner can
// choose instead, each defaulting to whatever the app already did.
export async function PATCH(req: Request) {
  const tenantId = await adminTenant();
  if (!tenantId) return forbidden();
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  if (Object.keys(parsed.data).length === 0) return NextResponse.json({ ok: true });

  await db.update(tenants).set(parsed.data).where(eq(tenants.id, tenantId));
  return NextResponse.json({ ok: true });
}
