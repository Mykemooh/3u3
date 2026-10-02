import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db/client';
import { users, serviceTypes, bookings } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { rescheduleBooking } from '@/lib/dispatch';
import { adminTenant, forbidden, teamApiError } from '@/lib/adminApi';
import { logNotification } from '@/lib/bookings';
import { sendEmail, bookingRescheduledCustomerEmail } from '@/lib/email';
import { formatDateLabel, formatSlotLabel } from '@/lib/scheduling';
import { appUrl } from '@/lib/url';
import { checkStandbyForFreedDate } from '@/lib/standby';

const schema = z.object({
  crewId: z.string().min(1).optional(),
  date: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  // Email the client when the day or time changes. A team change alone never emails.
  notify: z.boolean().default(true),
});

// Move a job on the schedule board: drag to another team/day, or edit its
// time in the job panel. Same no-double-booking rule as booking.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const tenantId = await adminTenant();
  if (!tenantId) return forbidden();
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  const { notify, ...patch } = parsed.data;

  const existing = (await db.select().from(bookings).where(eq(bookings.id, params.id)).limit(1))[0];
  if (!existing || existing.tenantId !== tenantId) return NextResponse.json({ error: 'Booking not found' }, { status: 404 });

  try {
    const result = await rescheduleBooking(params.id, patch);
    let clientNotified = false;
    if (result.moved && result.timeChanged && notify) {
      clientNotified = await notifyClient(result.booking, result.slotStart, result.slotEnd);
    }
    if (result.moved && result.booking.slotStart.slice(0, 10) !== result.slotStart.slice(0, 10)) {
      await checkStandbyForFreedDate(result.booking.tenantId, result.booking.slotStart.slice(0, 10));
    }
    return NextResponse.json({ ok: true, moved: result.moved, clientNotified });
  } catch (err) {
    return teamApiError(err);
  }
}

async function notifyClient(before: typeof bookings.$inferSelect, slotStart: string, slotEnd: string) {
  try {
    const client = (await db.select().from(users).where(eq(users.id, before.clientId)).limit(1))[0];
    if (!client?.email) return false;
    const service = before.serviceTypeId
      ? (await db.select().from(serviceTypes).where(eq(serviceTypes.id, before.serviceTypeId)).limit(1))[0]
      : undefined;
    const { subject, html } = bookingRescheduledCustomerEmail({
      name: client.name,
      serviceName: service?.name ?? 'Cleaning',
      dateLabel: formatDateLabel(slotStart.split('T')[0]),
      timeLabel: formatSlotLabel(slotStart, slotEnd),
      previousLabel: `${formatDateLabel(before.slotStart.split('T')[0])}, ${formatSlotLabel(before.slotStart, before.slotEnd)}`,
      accountUrl: appUrl('/account'),
    });
    const ok = await sendEmail({ to: client.email, subject, html });
    await logNotification({
      tenantId: before.tenantId,
      channel: 'EMAIL',
      recipient: client.email,
      triggerEvent: ok ? 'BOOKING_RESCHEDULED_CUSTOMER' : 'BOOKING_RESCHEDULED_CUSTOMER_NOT_DELIVERED',
      relatedBookingId: before.id,
    });
    return ok;
  } catch (err) {
    console.error('[schedule] reschedule email failed for booking', before.id, err);
    return false;
  }
}
