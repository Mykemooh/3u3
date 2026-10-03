import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { tenants } from '@/db/schema';
import { superAdminId, forbidden } from '@/lib/adminApi';

const schema = z.object({
  name: z.string().trim().min(1).optional(),
  tagline: z.string().nullable().optional(),
  primaryColor: z.string().optional(),
  inkColor: z.string().optional(),
  bronzeColor: z.string().optional(),
  creamColor: z.string().optional(),
  customDomain: z.string().nullable().optional(),
  logoUrl: z.string().nullable().optional(),
  // A SUPER_ADMIN override — comp a company's access manually (a VIP
  // deal, a refund, a sales demo) without needing a promo code.
  planStatus: z.enum(['TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED']).optional(),
  accessExpiresAt: z.string().nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const superAdmin = await superAdminId();
  if (!superAdmin) return forbidden();

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  const { accessExpiresAt, ...rest } = parsed.data;
  await db
    .update(tenants)
    .set({ ...rest, ...(accessExpiresAt !== undefined ? { accessExpiresAt: accessExpiresAt ? new Date(accessExpiresAt) : null } : {}) })
    .where(eq(tenants.id, params.id));
  return NextResponse.json({ ok: true });
}
