import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { adminTenant, forbidden } from '@/lib/adminApi';
import { db } from '@/db/client';
import { notificationLog } from '@/db/schema';

// Dismiss (mark read) one entry in the admin "Alerts" feed — client address
// changes, reschedules, cadence changes, cancellations.
export async function PATCH(_req: Request, { params }: { params: { id: string } }) {
  const tenantId = await adminTenant();
  if (!tenantId) return forbidden();

  const row = (
    await db
      .select()
      .from(notificationLog)
      .where(and(eq(notificationLog.id, params.id), eq(notificationLog.tenantId, tenantId)))
      .limit(1)
  )[0];
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await db.update(notificationLog).set({ isRead: true }).where(eq(notificationLog.id, params.id));
  return NextResponse.json({ ok: true });
}
