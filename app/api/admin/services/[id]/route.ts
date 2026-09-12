import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { db } from '@/db/client';
import { serviceTypes } from '@/db/schema';
import { eq } from 'drizzle-orm';

const schema = z.object({
  defaultDurationMinutes: z.number().int().min(30).max(600),
  recurringEligible: z.boolean(),
});

// Tenant-configurable service settings (PRD 6.4 / 6.8) — duration drives the
// scheduling engine's slot math in lib/scheduling.ts.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid settings' }, { status: 400 });

  await db.update(serviceTypes).set(parsed.data).where(eq(serviceTypes.id, params.id));
  return NextResponse.json({ ok: true });
}
