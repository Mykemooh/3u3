import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createBooking, DoubleBookingError, sendBookingConfirmationEmails } from '@/lib/bookings';
import { teamsFreeFor } from '@/lib/capacity';
import { getAddressesFor, getServiceType, getClientRatesFor, getTenant } from '@/lib/data';
import { pickNearestTeam } from '@/lib/routeOptimization';
import { getAddOnsForClient } from '@/lib/addons';

const schema = z.object({
  serviceTypeId: z.string(),
  slotStart: z.string(),
  slotEnd: z.string(),
  cadence: z.enum(['ONE_TIME', 'BIWEEKLY', 'MONTHLY']),
  addOnServiceIds: z.array(z.string()).optional(),
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
  const { serviceTypeId, slotStart, slotEnd, cadence, addOnServiceIds } = parsed.data;

  const service = await getServiceType(serviceTypeId);
  if (!service) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (cadence !== 'ONE_TIME' && !service.recurringEligible) {
    return NextResponse.json({ error: `${service.name} does not support recurring booking.` }, { status: 400 });
  }

  const rate = (await getClientRatesFor(clientId)).find((r) => r.serviceTypeId === serviceTypeId);
  const addresses = await getAddressesFor(clientId);

  // Re-price every selection server-side against the client's own catalog
  // — never trust a price sent from the browser.
  const availableAddOns = await getAddOnsForClient(tenant.id, clientId);
  const addOns = (addOnServiceIds ?? [])
    .map((id) => availableAddOns.find((a) => a.id === id))
    .filter((a): a is NonNullable<typeof a> => !!a)
    .map((a) => ({ addOnServiceId: a.id, name: a.name, priceCents: a.priceCents }));

  try {
    // Whichever free team is closest to the client takes it — a fast,
    // no-API-call straight-line estimate (lib/routeOptimization.ts
    // pickNearestTeam), not a full route optimization on every booking;
    // that's reserved for the admin's deliberate day-level "Optimize
    // route" (Admin -> Routes). If another booking grabs that team a
    // moment earlier, createBooking's transactional check refuses and
    // the next-nearest free team is tried; only when every team is taken
    // does it fail.
    const freeTeams = await teamsFreeFor(tenant.id, service.defaultDurationMinutes, slotStart, slotEnd);
    const teams = await pickNearestTeam(freeTeams, addresses[0] ?? null);
    let bookingId: string | null = null;
    for (const team of teams) {
      try {
        bookingId = await createBooking({
          tenantId: tenant.id,
          clientId,
          serviceTypeId,
          crewId: team.id,
          addressId: addresses[0]?.id,
          slotStart,
          slotEnd,
          cadence,
          priceCents: rate?.rateCents,
          isQuoteVisit: false,
          addOns,
        });
        break;
      } catch (err) {
        if (!(err instanceof DoubleBookingError)) throw err;
      }
    }
    if (!bookingId) throw new DoubleBookingError();

    // Previously this only logged a confirmation and never sent one. Now
    // the client gets a real email and the owner gets an alert. Neither can
    // fail the booking — it's already safely in the database.
    try {
      await sendBookingConfirmationEmails({
        tenantId: tenant.id,
        bookingId,
        clientId,
        serviceName: service.name,
        serviceKey: service.key,
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
