import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { adminTenant, forbidden } from '@/lib/adminApi';

const schema = z.object({ billingMode: z.enum(['PER_CLEAN', 'MONTHLY_BATCH']) });

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const tenantId = await adminTenant();
  if (!tenantId) return forbidden();
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  await db.update(users).set({ billingMode: parsed.data.billingMode }).where(and(eq(users.id, params.id), eq(users.tenantId, tenantId)));
  return NextResponse.json({ ok: true });
}
