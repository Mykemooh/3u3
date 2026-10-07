import { normalizePhone, samePhone } from '@/lib/phone';
import { belongsTo, notFound } from '@/lib/tenantGuard';
import { adminSession } from '@/lib/adminApi';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { db } from '@/db/client';
import { clientRates, users } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

const schema = z.object({
  clientPhone: z.string().min(7),
  clientName: z.string().min(1),
  serviceTypeId: z.string(),
  rateDollars: z.number().positive(),
});

// Per-client agreed rate (PRD 2 / 6.3) — pricing is per client and per
// home, never a flat rate. Creates the client record if this phone number
// isn't on file yet.
export async function POST(req: Request) {
  const admin = await adminSession();
  if (!admin) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }
  const tenantId = admin.tenantId;
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  const { clientName, serviceTypeId, rateDollars } = parsed.data;
  const clientPhone = normalizePhone(parsed.data.clientPhone);
  if (!(await belongsTo(tenantId, 'service', serviceTypeId))) return notFound();

  // This company's own client with that number — never another company's.
  let client = (await db.select().from(users).where(and(samePhone(clientPhone) ?? eq(users.phone, clientPhone), eq(users.tenantId, tenantId))).limit(1))[0];
  if (!client) {
    const id = crypto.randomUUID();
    await db.insert(users).values({ id, tenantId, role: 'CUSTOMER', name: clientName, phone: clientPhone });
    client = (await db.select().from(users).where(eq(users.id, id)).limit(1))[0]!;
  }

  const existing = (
    await db
      .select()
      .from(clientRates)
      .where(and(eq(clientRates.userId, client.id), eq(clientRates.serviceTypeId, serviceTypeId)))
      .limit(1)
  )[0];

  const rateCents = Math.round(rateDollars * 100);
  if (existing) {
    await db.update(clientRates).set({ rateCents }).where(eq(clientRates.id, existing.id));
  } else {
    await db.insert(clientRates).values({ id: crypto.randomUUID(), userId: client.id, serviceTypeId, rateCents });
  }

  return NextResponse.json({ ok: true, clientId: client.id });
}
