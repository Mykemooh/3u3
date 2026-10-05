import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getTenant, getOwnerEmail, getUserById } from '@/lib/data';
import {
  rescheduleBookingByClient,
  updateBookingCadenceByClient,
  cancelBookingByClient,
  logNotification,
  DoubleBookingError,
  BookingNotFoundError,
  BookingLockedError,
} from '@/lib/bookings';
import { sendEmail, clientAccountChangeOwnerEmail } from '@/lib/email';
import { appUrl } from '@/lib/url';
import { checkStandbyForFreedDate } from '@/lib/standby';
import { db } from '@/db/client';
import { bookings } from '@/db/schema';
import { eq } from 'drizzle-orm';

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('reschedule'), slotStart: z.string(), slotEnd: z.string() }),
  z.object({ action: z.literal('cadence'), cadence: z.enum(['ONE_TIME', 'BIWEEKLY', 'MONTHLY']) }),
  z.object({ action: z.literal('cancel') }),
  z.object({ action: z.literal('note'), note: z.string().max(1000) }),
]);

// Customer self-service booking changes — reschedule, change cadence, or
// cancel — all gated by the 24-hour cutoff enforced in lib/bookings.ts.
// Admins are not subject to this cutoff; see app/api/admin/bookings/[id].
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as any).role !== 'CUSTOMER') {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }
  const clientId = (session.user as any).id as string;

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  const tenant = await getTenant();
  if (!tenant) return NextResponse.json({ error: 'Not set up' }, { status: 500 });

  // A note for the crew on one upcoming visit ("the dog is out back today").
  // Not subject to the 24-hour cutoff — it changes nothing on the schedule.
  if (parsed.data.action === 'note') {
    const row = (await db.select().from(bookings).where(eq(bookings.id, params.id)).limit(1))[0];
    if (!row || row.clientId !== clientId) return NextResponse.json({ error: 'Booking not found.' }, { status: 404 });
    if (row.status === 'CANCELLED' || row.status === 'COMPLETED') return NextResponse.json({ error: 'That cleaning is already finished.' }, { status: 409 });
    await db.update(bookings).set({ clientNotes: parsed.data.note.trim() || null }).where(eq(bookings.id, params.id));
    return NextResponse.json({ ok: true });
  }

  try {
    let summary = '';
    // Captured before the change, for the standby check below — a
    // reschedule or cancellation frees up this original date.
    const before = (await db.select({ slotStart: bookings.slotStart, tenantId: bookings.tenantId }).from(bookings).where(eq(bookings.id, params.id)).limit(1))[0];

    if (parsed.data.action === 'reschedule') {
      await rescheduleBookingByClient({
        bookingId: params.id,
        clientId,
        slotStart: parsed.data.slotStart,
        slotEnd: parsed.data.slotEnd,
      });
      summary = `Moved their cleaning to ${parsed.data.slotStart.replace('T', ' ')}.`;
      if (before && before.slotStart.slice(0, 10) !== parsed.data.slotStart.slice(0, 10)) {
        await checkStandbyForFreedDate(before.tenantId, before.slotStart.slice(0, 10));
      }
    } else if (parsed.data.action === 'cadence') {
      await updateBookingCadenceByClient({ bookingId: params.id, clientId, cadence: parsed.data.cadence });
      summary = `Changed their cleaning frequency to ${parsed.data.cadence.replace('_', ' ').toLowerCase()}.`;
    } else {
      await cancelBookingByClient({ bookingId: params.id, clientId });
      summary = 'Cancelled an upcoming cleaning.';
      if (before) await checkStandbyForFreedDate(before.tenantId, before.slotStart.slice(0, 10));
    }

    const client = await getUserById(clientId);
    await logNotification({
      tenantId: tenant.id,
      channel: 'EMAIL',
      recipient: client?.name ?? 'A client',
      triggerEvent: `CUSTOMER_BOOKING_CHANGE (${parsed.data.action}): ${summary}`,
      relatedBookingId: params.id,
    });

    const ownerEmail = await getOwnerEmail(tenant.id);
    if (ownerEmail && client) {
      const { subject, html } = clientAccountChangeOwnerEmail({
        clientName: client.name,
        clientPhone: client.phone ?? undefined,
        summary,
        manageUrl: appUrl(`/admin/clients/${client.id}`),
      });
      await sendEmail({ to: ownerEmail, subject, html });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof BookingLockedError) return NextResponse.json({ error: err.message }, { status: 403 });
    if (err instanceof BookingNotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
    if (err instanceof DoubleBookingError) return NextResponse.json({ error: err.message }, { status: 409 });
    if (err instanceof Error) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
