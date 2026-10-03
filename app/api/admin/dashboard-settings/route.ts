import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminTenant, forbidden } from '@/lib/adminApi';
import { updateDashboardSettings, WIDGET_KEYS } from '@/lib/dashboard';

const schema = z.object({
  hiddenWidgets: z.array(z.enum(WIDGET_KEYS)).optional(),
  avgSupplyCostDollars: z.number().nonnegative().optional(),
});

export async function PATCH(req: Request) {
  const tenantId = await adminTenant();
  if (!tenantId) return forbidden();
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  await updateDashboardSettings(tenantId, {
    hiddenWidgets: parsed.data.hiddenWidgets,
    avgSupplyCostCents: parsed.data.avgSupplyCostDollars != null ? Math.round(parsed.data.avgSupplyCostDollars * 100) : undefined,
  });
  return NextResponse.json({ ok: true });
}
