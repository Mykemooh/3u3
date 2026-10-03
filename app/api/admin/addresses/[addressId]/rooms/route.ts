import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { adminTenant, forbidden } from '@/lib/adminApi';
import { db } from '@/db/client';
import { addresses, users } from '@/db/schema';

const schema = z.object({
  bedrooms: z.number().int().min(1).max(20).nullable().optional(),
  bathrooms: z.number().int().min(1).max(20).nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: { addressId: string } }) {
  const tenantId = await adminTenant();
  if (!tenantId) return forbidden();

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  // The address has to belong to a client in this admin's own tenant.
  const owned = (
    await db.select({ id: addresses.id }).from(addresses).innerJoin(users, eq(users.id, addresses.userId)).where(and(eq(addresses.id, params.addressId), eq(users.tenantId, tenantId))).limit(1)
  )[0];
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await db.update(addresses).set(parsed.data).where(eq(addresses.id, params.addressId));
  return NextResponse.json({ ok: true });
}
