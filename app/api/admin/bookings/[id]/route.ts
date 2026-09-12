import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { db } from '@/db/client';
import { bookings } from '@/db/schema';
import { eq } from 'drizzle-orm';

const schema = z.object({
  status: z.enum(['CONFIRMED', 'COMPLETED', 'CANCELLED']),
});

// Admin-side booking status transitions — covers both quote visits
// (Requested -> Completed once visited, or Cancelled) and cleaning jobs
// (Confirmed -> Completed/Cancelled). Terminal states are not reopenable
// here to keep the history trustworthy (PRD section 8).
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid status' }, { status: 400 });

  const existing = (await db.select().from(bookings).where(eq(bookings.id, params.id)).limit(1))[0];
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (existing.status === 'COMPLETED' || existing.status === 'CANCELLED') {
    return NextResponse.json({ error: `This booking is already ${existing.status.toLowerCase()}.` }, { status: 400 });
  }

  await db.update(bookings).set({ status: parsed.data.status }).where(eq(bookings.id, params.id));
  return NextResponse.json({ ok: true });
}
