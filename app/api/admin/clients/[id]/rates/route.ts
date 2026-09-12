import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { db } from '@/db/client';
import { clientRates } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

const schema = z.object({
  serviceTypeId: z.string(),
  rateDollars: z.number().positive(),
});

// Set or update this client's agreed rate for a service (PRD 2 / 6.3) —
// scoped to a known client id, for use from the client detail page.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  const { serviceTypeId, rateDollars } = parsed.data;
  const rateCents = Math.round(rateDollars * 100);

  const existing = (
    await db
      .select()
      .from(clientRates)
      .where(and(eq(clientRates.userId, params.id), eq(clientRates.serviceTypeId, serviceTypeId)))
      .limit(1)
  )[0];

  if (existing) {
    await db.update(clientRates).set({ rateCents }).where(eq(clientRates.id, existing.id));
  } else {
    await db.insert(clientRates).values({ id: crypto.randomUUID(), userId: params.id, serviceTypeId, rateCents });
  }

  return NextResponse.json({ ok: true });
}
