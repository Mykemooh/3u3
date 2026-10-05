import { NextResponse } from 'next/server';
import { adminSession, forbidden } from '@/lib/adminApi';
import { skipVisit } from '@/lib/recurring';
import { rescheduleBooking } from '@/lib/dispatch';
import { belongsTo, notFound } from '@/lib/tenantGuard';
import { statusApiError } from '@/lib/api';
import { logChange } from '@/lib/audit';

/** Move or skip one visit — the rest of its series is untouched. */
export async function POST(req: Request, { params }: { params: { bookingId: string } }) {
  const admin = await adminSession();
  if (!admin) return forbidden();
  if (!(await belongsTo(admin.tenantId, 'booking', params.bookingId))) return notFound();
  const body = await req.json().catch(() => ({}));
  const actor = { id: admin.userId, name: admin.name };
  try {
    if (body.action === 'skip') {
      await skipVisit(admin.tenantId, params.bookingId, actor);
      return NextResponse.json({ ok: true });
    }
    if (body.action === 'move') {
      const res = await rescheduleBooking(params.bookingId, { date: body.date, startTime: body.startTime, endTime: body.endTime, crewId: body.crewId });
      if (res.moved) {
        await logChange({
          tenantId: admin.tenantId,
          actor,
          entityType: res.booking.seriesId ? 'series' : 'booking',
          entityId: res.booking.seriesId ?? res.booking.id,
          action: 'visit_moved',
          summary: `Moved one visit from ${res.booking.slotStart.replace('T', ' ').slice(0, 16)} to ${(res as { slotStart?: string }).slotStart?.replace('T', ' ').slice(0, 16) ?? 'a new team'}`,
        });
      }
      return NextResponse.json({ ok: true, moved: res.moved });
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    return statusApiError(err);
  }
}
