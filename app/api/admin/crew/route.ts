import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { db } from '@/db/client';
import { crews } from '@/db/schema';
import { eq } from 'drizzle-orm';

const schema = z.object({
  crewId: z.string(),
  workStartMinutes: z.number().int().min(0).max(1439),
  workEndMinutes: z.number().int().min(0).max(1439),
  homesPerDay: z.number().int().min(1).max(10),
  commuteBufferMinutes: z.number().int().min(0).max(180),
});

// Admin-configurable scheduling engine settings (PRD 6.4). Changing any
// setting here recalculates future availability windows automatically;
// already-confirmed bookings are untouched.
export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid settings' }, { status: 400 });

  const { crewId, ...rest } = parsed.data;
  if (rest.workEndMinutes <= rest.workStartMinutes) {
    return NextResponse.json({ error: 'Working hours end must be after start.' }, { status: 400 });
  }

  await db.update(crews).set(rest).where(eq(crews.id, crewId));
  return NextResponse.json({ ok: true });
}
