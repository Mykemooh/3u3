import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getBookingById, getServiceType, getAddressesFor, SERVICE_LABELS } from '@/lib/data';
import { buildIcs } from '@/lib/calendar';
import { companyForTenant } from '@/lib/emailBrand';
import { formatSlotLabel } from '@/lib/scheduling';

// A downloadable .ics for one booking — the universal option on the
// "Add to calendar" menu (lib/calendar.ts), for Apple Calendar, desktop/
// web Outlook, and Skylight. Google and Outlook.com get their own direct
// links instead (no download needed); this route is what backs those
// plus every other calendar app.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string; role?: string } | undefined;
  if (!user?.id) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const booking = await getBookingById(params.id);
  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (user.role !== 'ADMIN' && booking.clientId !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const [service, addresses, company] = await Promise.all([
    booking.serviceTypeId ? getServiceType(booking.serviceTypeId) : Promise.resolve(undefined),
    getAddressesFor(booking.clientId),
    companyForTenant(booking.tenantId),
  ]);
  const address = addresses.find((a) => a.id === booking.addressId) ?? addresses[0];
  const serviceName = service ? SERVICE_LABELS[service.key as keyof typeof SERVICE_LABELS] ?? service.name : 'Cleaning';

  const ics = buildIcs({
    // The uid's domain is only an identifier — kept as-is so events already
    // added to someone's calendar update instead of duplicating.
    uid: `booking-${booking.id}@3u3cleaning`,
    title: `${serviceName} — ${company.name}`,
    description: `Your ${serviceName.toLowerCase()} with ${company.name}, ${formatSlotLabel(booking.slotStart, booking.slotEnd)}.`,
    location: address ? `${address.line1}, ${address.city}, ${address.state}${address.zip ? ` ${address.zip}` : ''}` : undefined,
    slotStart: booking.slotStart,
    slotEnd: booking.slotEnd,
  });

  return new NextResponse(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `inline; filename="cleaning-${booking.id.slice(0, 8)}.ics"`,
    },
  });
}
