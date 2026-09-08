import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createBooking, DoubleBookingError, logNotification } from '@/lib/bookings';
import { getAddressesFor, getPrimaryCrew, getServiceType, getClientRatesFor, getTenant } from '@/lib/data';

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

    await logNotification({
      tenantId: tenant.id,
      channel: 'EMAIL',
      recipient: (session.user as any).name ?? 'customer',
      triggerEvent: 'BOOKING_CONFIRMATION_CUSTOMER',
      relatedBookingId: bookingId,
    });

    return NextResponse.json({ bookingId });
  } catch (err) {
    if (err instanceof DoubleBookingError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error(err);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
