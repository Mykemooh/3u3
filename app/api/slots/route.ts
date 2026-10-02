import { NextResponse } from 'next/server';
import { businessTodayDate } from '@/lib/time';
import { getTenant, getServiceType } from '@/lib/data';
import { combinedSlots } from '@/lib/capacity';

// Reads live booking data — must run per-request. Without this, Next tries
// to statically prerender the route at build time (see the same note on
// /api/quote-slots), which fails the production build outright whenever the
// database isn't reachable at build time — this is what was breaking
// `npm run build` / Vercel deploys before this fix.
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const tenant = await getTenant();
  if (!tenant) return NextResponse.json({ error: 'Not set up' }, { status: 500 });

  const { searchParams } = new URL(req.url);
  const serviceTypeId = searchParams.get('serviceTypeId');
  if (!serviceTypeId) return NextResponse.json({ error: 'serviceTypeId required' }, { status: 400 });

  const service = await getServiceType(serviceTypeId);
  if (!service) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Every team that takes online bookings, merged: a time is open if any
  // team is free. A full year out (not just the next couple of weeks) so
  // the booking calendar (components/BookingCalendar.tsx) can show real
  // availability for any month a client navigates to without another
  // round trip — this is cheap: one query per crew, then pure in-memory
  // date math (lib/scheduling.ts), not 365 separate day queries.
  const days = await combinedSlots(tenant.id, service.defaultDurationMinutes, 365, businessTodayDate());
  return NextResponse.json({ days });
}
