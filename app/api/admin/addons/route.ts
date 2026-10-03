import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { createAddOnService } from '@/lib/addons';

const schema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  defaultPriceDollars: z.number().positive(),
});

// The tenant-wide add-on catalog (lib/addons.ts) — "Want to add a service
// for this clean?" on the booking wizard.
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const tenantId = (session?.user as any)?.tenantId;
  if ((session?.user as any)?.role !== 'ADMIN' || !tenantId) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  const id = await createAddOnService({
    tenantId,
    name: parsed.data.name,
    description: parsed.data.description || null,
    defaultPriceCents: Math.round(parsed.data.defaultPriceDollars * 100),
  });
  return NextResponse.json({ ok: true, id });
}
