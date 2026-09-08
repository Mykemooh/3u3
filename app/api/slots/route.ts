import { NextResponse } from 'next/server';
import { generateUpcomingSlots } from '@/lib/scheduling';
import { getTenant, getServiceType, getPrimaryCrew, getBookingsForCrewOnOrAfter } from '@/lib/data';

export async function GET(req: Request) {
  const tenant = await getTenant();
  if (!tenant) return NextResponse.json({ error: 'Not set up' }, { status: 500 });

  const { searchParams } = new URL(req.url);
  const serviceTypeId = searchParams.get('serviceTypeId');
  if (!serviceTypeId) return NextResponse.json({ error: 'serviceTypeId required' }, { status: 400 });

  const service = await getServiceType(serviceTypeId);
  const crew = await getPrimaryCrew(tenant.id);
  if (!service || !crew) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const existing = (await getBookingsForCrewOnOrAfter(crew.id)).filter((b) => !b.isQuoteVisit);
  const days = generateUpcomingSlots(crew, service.defaultDurationMinutes, existing, 10);

  return NextResponse.json({ days, crewId: crew.id });
}
