import { belongsTo, notFound } from '@/lib/tenantGuard';
import { adminSession } from '@/lib/adminApi';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { db } from '@/db/client';
import { serviceTypes } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { logChange, diff } from '@/lib/audit';

const schema = z.object({
  defaultDurationMinutes: z.number().int().min(30).max(720).optional(),
  recurringEligible: z.boolean().optional(),
  // Whether the company offers this line at all (hidden from the request form when off).
  offered: z.boolean().optional(),
});

// Tenant-configurable service settings (PRD 6.4 / 6.8) — duration drives the
// scheduling engine's slot math in lib/scheduling.ts.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const guardAdmin = await adminSession();
  if (!guardAdmin) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }
  if (!(await belongsTo(guardAdmin.tenantId, 'service', params.id))) return notFound();
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid settings' }, { status: 400 });

  const before = (await db.select().from(serviceTypes).where(eq(serviceTypes.id, params.id)).limit(1))[0];
  await db.update(serviceTypes).set(parsed.data).where(eq(serviceTypes.id, params.id));
  await logChange({
    tenantId: guardAdmin.tenantId,
    actor: { id: guardAdmin.userId, name: guardAdmin.name },
    entityType: 'service',
    entityId: params.id,
    action: 'updated',
    summary: `${before?.name ?? 'Service'}: ${parsed.data.offered === false ? 'switched off' : parsed.data.offered === true ? 'switched on' : 'settings changed'}`,
    changes: before ? diff(before, parsed.data) : [],
  });
  return NextResponse.json({ ok: true });
}
