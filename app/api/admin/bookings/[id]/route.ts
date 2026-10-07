import { bookingEvent, scheduleChanged } from '@/lib/events';
import { logChange, diff } from '@/lib/audit';
import { belongsTo, notFound } from '@/lib/tenantGuard';
import { adminSession } from '@/lib/adminApi';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { db } from '@/db/client';
import { bookings } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { checkStandbyForFreedDate } from '@/lib/standby';

const schema = z
  .object({
    status: z.enum(['CONFIRMED', 'COMPLETED', 'CANCELLED']).optional(),
    cadence: z.enum(['ONE_TIME', 'WEEKLY', 'BIWEEKLY', 'EVERY_4_WEEKS', 'MONTHLY']).optional(),
    priceDollars: z.number().positive().optional(),
  })
  .refine((v) => v.status !== undefined || v.cadence !== undefined || v.priceDollars !== undefined, {
    message: 'Nothing to update',
  });

// Admin-side booking edits — status transitions (quote visit or cleaning
// job), plus free-form cadence/price corrections. Admins aren't subject to
// the 24-hour customer self-service cutoff (lib/bookings.ts), and a
// cadence/price correction is allowed even on a completed/cancelled
// booking (e.g. fixing a price after the fact); only a *status* change is
// blocked once a booking is terminal, to keep the history trustworthy
// (PRD section 8).
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const guardAdmin = await adminSession();
  if (!guardAdmin) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }
  if (!(await belongsTo(guardAdmin.tenantId, 'booking', params.id))) return notFound();

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  const existing = (await db.select().from(bookings).where(eq(bookings.id, params.id)).limit(1))[0];
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const updates: Partial<typeof bookings.$inferInsert> = {};

  if (parsed.data.status !== undefined) {
    if (existing.status === 'COMPLETED' || existing.status === 'CANCELLED') {
      return NextResponse.json({ error: `This booking is already ${existing.status.toLowerCase()}.` }, { status: 400 });
    }
    updates.status = parsed.data.status;
  }
  if (parsed.data.cadence !== undefined) updates.cadence = parsed.data.cadence;
  if (parsed.data.priceDollars !== undefined) updates.priceCents = Math.round(parsed.data.priceDollars * 100);

  await db.update(bookings).set(updates).where(eq(bookings.id, params.id));
  const changes = diff(existing, updates, ['status', 'cadence', 'priceCents']);
  if (changes.length) {
    await logChange({
      tenantId: existing.tenantId,
      actor: { id: guardAdmin.userId, name: guardAdmin.name },
      entityType: 'booking',
      entityId: existing.id,
      action: updates.status === 'CANCELLED' ? 'cancelled' : 'updated',
      summary: updates.status === 'CANCELLED' ? 'Cancelled the booking' : 'Edited the booking',
      changes,
    });
  }

  if (updates.status === 'CANCELLED') {
    await bookingEvent('booking.cancelled', existing.id);
    await scheduleChanged(existing.tenantId);
    await checkStandbyForFreedDate(existing.tenantId, existing.slotStart.slice(0, 10));
  }

  return NextResponse.json({ ok: true });
}
