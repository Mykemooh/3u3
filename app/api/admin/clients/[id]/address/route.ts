import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { adminTenant, forbidden } from '@/lib/adminApi';
import { db } from '@/db/client';
import { users, addresses } from '@/db/schema';
import { getAddressesFor } from '@/lib/data';

const schema = z.object({
  line1: z.string().trim().min(1),
  city: z.string().trim().min(1),
  state: z.string().trim().min(2),
  zip: z.string().trim().optional(),
  notes: z.string().trim().max(2000).optional(),
  bedrooms: z.number().int().min(1).max(20).nullable().optional(),
});

// Admin edits a client's address directly from their client record — no
// 24-hour cutoff, no notification needed (the admin is the one making
// the change).
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const tenantId = await adminTenant();
  if (!tenantId) return forbidden();

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Please fill in a complete address.' }, { status: 400 });
  const { line1, city, state, zip, notes, bedrooms } = parsed.data;

  const client = (
    await db.select().from(users).where(and(eq(users.id, params.id), eq(users.tenantId, tenantId))).limit(1)
  )[0];
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

  const existing = await getAddressesFor(params.id);
  const primary = existing.find((a) => a.isPrimary) ?? existing[0];

  if (primary) {
    await db.update(addresses).set({ line1, city, state, zip, notes: notes ?? null, bedrooms: bedrooms ?? null }).where(eq(addresses.id, primary.id));
  } else {
    await db.insert(addresses).values({ id: crypto.randomUUID(), userId: params.id, line1, city, state, zip, notes: notes ?? null, bedrooms: bedrooms ?? null, isPrimary: true });
  }

  return NextResponse.json({ ok: true });
}
