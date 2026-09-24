import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createBooking, DoubleBookingError, logNotification } from '@/lib/bookings';
import { getAddressesFor, getPrimaryCrew, getServiceType, getClientRatesFor, getTenant, getUserById, getOwnerEmail, formatMoney } from '@/lib/data';
import { sendEmail, bookingConfirmedCustomerEmail, newBookingOwnerEmail } from '@/lib/email';
import { formatSlotLabel, formatDateLabel } from '@/lib/scheduling';
import { appUrl } from '@/lib/url';

const schema = z.object({
  serviceTypeId: z.string(),
  slotStart: z.string(),
  slotEnd: z.string(),
  cadence: z.enum(['ONE_TIME', 'BIWEEKLY', 'MONTHLY']),
});

// Returning-customer booking (PRD 6.3): booked at the client's own agreed
// rate, against real crew availability. Recurring cadence is only accepted
// for services flagged recurringEligible (Standard) — Deep cleaning is
// one-time/quarterly by business rule and never recurs here.
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as any).role !== 'CUSTOMER') {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }
  const clientId = (session.user as any).id as string;
  const tenant = await getTenant();
  if (!tenant) return NextResponse.json({ error: 'Not set up' }, { status: 500 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  const { serviceTypeId, slotStart, slotEnd, cadence } = parsed.data;

  const service = await getServiceType(serviceTypeId);
  const crew = await getPrimaryCrew(tenant.id);
  if (!service || !crew) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (cadence !== 'ONE_TIME' && !service.recurringEligible) {
    return NextResponse.json({ error: `${service.name} does not support recurring booking.` }, { status: 400 });
  }

  const rate = (await getClientRatesFor(clientId)).find((r) => r.serviceTypeId === serviceTypeId);
  const addresses = await getAddressesFor(clientId);

  try {
    const bookingId = await createBooking({
      tenantId: tenant.id,
      clientId,
      serviceTypeId,
      crewId: crew.id,
      addressId: addresses[0]?.id,
      slotStart,
      slotEnd,
      cadence,
      priceCents: rate?.rateCents,
      isQuoteVisit: false,
    });

    // Previously this only logged a confirmation and never sent one. Now
    // the client gets a real email and the owner gets an alert. Neither can
    // fail the booking — it's already safely in the database.
    try {
      await sendBookingEmails({
        tenantId: tenant.id,
        bookingId,
        clientId,
        serviceName: service.name,
        slotStart,
        slotEnd,
        priceCents: rate?.rateCents ?? null,
        address: addresses[0],
      });
    } catch (err) {
      console.error('[bookings] confirmation emails failed', err);
    }

    return NextResponse.json({ bookingId });
  } catch (err) {
    if (err instanceof DoubleBookingError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error(err);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}

async function sendBookingEmails(input: {
  tenantId: string;
  bookingId: string;
  clientId: string;
  serviceName: string;
  slotStart: string;
  slotEnd: string;
  priceCents: number | null;
  address?: { line1: string; city: string; state: string; zip: string | null };
}) {
  const client = await getUserById(input.clientId);
  const whenLabel = `${formatDateLabel(input.slotStart.slice(0, 10))}, ${formatSlotLabel(input.slotStart, input.slotEnd)}`;
  const addressLabel = input.address
    ? `${input.address.line1}, ${input.address.city}, ${input.address.state}${input.address.zip ? ` ${input.address.zip}` : ''}`
    : undefined;
  const priceLabel = input.priceCents != null ? formatMoney(input.priceCents) : undefined;

  if (client?.email) {
    const { subject, html } = bookingConfirmedCustomerEmail({
      name: client.name,
      serviceName: input.serviceName,
      whenLabel,
      addressLabel,
      priceLabel,
      accountUrl: appUrl('/account'),
    });
    const ok = await sendEmail({ to: client.email, subject, html });
    await logNotification({
      tenantId: input.tenantId,
      channel: 'EMAIL',
      recipient: client.email,
      triggerEvent: ok ? 'BOOKING_CONFIRMATION_CUSTOMER' : 'BOOKING_CONFIRMATION_CUSTOMER_NOT_DELIVERED',
      relatedBookingId: input.bookingId,
    });
  }

  const ownerEmail = await getOwnerEmail(input.tenantId);
  if (ownerEmail) {
    const { subject, html } = newBookingOwnerEmail({
      clientName: client?.name ?? 'A client',
      clientPhone: client?.phone ?? undefined,
      serviceName: input.serviceName,
      whenLabel,
      addressLabel,
      priceLabel,
      scheduleUrl: appUrl(`/admin/schedule?week=${input.slotStart.slice(0, 10)}`),
    });
    const ok = await sendEmail({ to: ownerEmail, subject, html });
    await logNotification({
      tenantId: input.tenantId,
      channel: 'EMAIL',
      recipient: ownerEmail,
      triggerEvent: ok ? 'NEW_BOOKING_OWNER_ALERT' : 'NEW_BOOKING_OWNER_ALERT_NOT_DELIVERED',
      relatedBookingId: input.bookingId,
    });
  }
}
