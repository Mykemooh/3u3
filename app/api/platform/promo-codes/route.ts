import { NextResponse } from 'next/server';
import { z } from 'zod';
import { superAdminId, forbidden } from '@/lib/adminApi';
import { createPromoCode, listPromoCodes, PlatformError } from '@/lib/platform';

const schema = z.object({
  code: z.string().trim().min(3),
  tier: z.enum(['TRIAL_1MO', 'TRIAL_3MO', 'FOREVER']),
  maxRedemptions: z.number().int().positive().nullable().optional(),
});

export async function GET() {
  const superAdmin = await superAdminId();
  if (!superAdmin) return forbidden();
  return NextResponse.json({ codes: await listPromoCodes() });
}

export async function POST(req: Request) {
  const superAdmin = await superAdminId();
  if (!superAdmin) return forbidden();

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  try {
    const id = await createPromoCode({ ...parsed.data, createdByUserId: superAdmin });
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    if (err instanceof PlatformError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
