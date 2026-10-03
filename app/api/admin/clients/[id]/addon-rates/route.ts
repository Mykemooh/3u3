import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { setClientAddOnRate, clearClientAddOnRate } from '@/lib/addons';

const setSchema = z.object({
  addOnServiceId: z.string(),
  priceDollars: z.number().positive(),
});

const clearSchema = z.object({
  addOnServiceId: z.string(),
});

// This client's override price for one add-on (mirrors
// /api/admin/clients/[id]/rates, just for add-ons) — set during quote/
// client profile setup. Omitting a rate here just falls back to the
// catalog's default price.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }
  const body = await req.json();
  const parsed = setSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  await setClientAddOnRate(params.id, parsed.data.addOnServiceId, Math.round(parsed.data.priceDollars * 100));
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }
  const body = await req.json();
  const parsed = clearSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  await clearClientAddOnRate(params.id, parsed.data.addOnServiceId);
  return NextResponse.json({ ok: true });
}
