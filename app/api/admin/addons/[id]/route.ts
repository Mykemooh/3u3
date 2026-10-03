import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { updateAddOnService } from '@/lib/addons';

const schema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  defaultPriceDollars: z.number().positive().optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  const { defaultPriceDollars, ...rest } = parsed.data;
  await updateAddOnService(params.id, {
    ...rest,
    ...(defaultPriceDollars != null ? { defaultPriceCents: Math.round(defaultPriceDollars * 100) } : {}),
  });
  return NextResponse.json({ ok: true });
}
