import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { loadJob, canWorkJob, viewerFrom } from '@/lib/jobs';
import { geocodeAddress, isValidLngLat } from '@/lib/geocoding';
import { publicMapboxToken } from '@/lib/tracking';
import { fetchRouteOptions, tollPassLabel, withChoiceTokens } from '@/lib/directions';
import { translator } from '@/lib/i18n';
import { crewMessages } from '@/lib/i18n/messages/crew';

// Geocoded fresh, in memory, for this one request only — never written
// to the job row (that's reserved for an actual EN_ROUTE trip,
// lib/tracking.ts). Any crew member on the job can ask for directions,
// not just the lead (unlike live location sharing, which is lead-only).
//
// With ?lat=&lng= (the phone's position) it also returns the route
// choices and their tolls (lib/directions.ts): &avoidTolls=1 to skip toll
// roads, &alt=0 for just one route (a reroute), &lang=es for Spanish
// turn-by-turn. Each route carries a signed choiceToken that
// POST /api/crew/jobs/[id]/trip records when navigation starts.
export async function GET(req: Request, { params }: { params: { jobId: string } }) {
  const viewer = viewerFrom(await getServerSession(authOptions));
  const data = await loadJob(params.jobId);
  if (!data || !(await canWorkJob(viewer, data.job))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const mapboxToken = publicMapboxToken();
  const address = data.address;
  if (!address) return NextResponse.json({ destination: null, addressLabel: null, mapboxToken, routes: null });

  const addressLabel = `${address.line1}, ${address.city}, ${address.state}${address.zip ? ` ${address.zip}` : ''}`;
  const destination = await geocodeAddress(addressLabel);

  const url = new URL(req.url);
  const from = { lat: Number(url.searchParams.get('lat')), lng: Number(url.searchParams.get('lng')) };
  const wantsRoutes = url.searchParams.has('lat') && isValidLngLat(from);
  if (!wantsRoutes || !destination) {
    return NextResponse.json({ destination, addressLabel, mapboxToken, routes: null });
  }

  const lang = url.searchParams.get('lang') === 'es' ? 'es' : 'en';
  const avoidTolls = url.searchParams.get('avoidTolls') === '1';
  const result = await fetchRouteOptions({
    from,
    to: destination,
    avoidTolls,
    lang,
    alternatives: url.searchParams.get('alt') !== '0',
    arriveText: translator(crewMessages, lang)('mapSpeakArrived'),
  });
  return NextResponse.json({
    destination,
    addressLabel,
    mapboxToken,
    // null = no provider could route right now (the map still shows the destination).
    routes: result ? withChoiceTokens(params.jobId, result.options, { avoidTolls }) : null,
    provider: result?.provider ?? null,
    tollPass: result?.provider === 'google' ? tollPassLabel() : null,
  });
}
