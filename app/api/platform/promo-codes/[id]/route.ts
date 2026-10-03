import { NextResponse } from 'next/server';
import { z } from 'zod';
import { superAdminId, forbidden } from '@/lib/adminApi';
import { setPromoCodeActive } from '@/lib/platform';

const schema = z.object({ active: z.boolean() });

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const superAdmin = await superAdminId();
  if (!superAdmin) return forbidden();
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  await setPromoCodeActive(params.id, parsed.data.active);
  return NextResponse.json({ ok: true });
}
