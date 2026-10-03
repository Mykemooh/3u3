import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { tenants } from '@/db/schema';
import { adminTenant, forbidden } from '@/lib/adminApi';

const schema = z.object({ serviceAreaRadiusMiles: z.number().int().min(1).max(200) });

export async function PATCH(req: Request) {
  const tenantId = await adminTenant();
  if (!tenantId) return forbidden();
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Enter a radius between 1 and 200 miles.' }, { status: 400 });

  await db.update(tenants).set({ serviceAreaRadiusMiles: parsed.data.serviceAreaRadiusMiles }).where(eq(tenants.id, tenantId));
  return NextResponse.json({ ok: true });
}
