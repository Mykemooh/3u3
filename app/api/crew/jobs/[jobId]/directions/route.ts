import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { loadJob, canWorkJob, viewerFrom } from '@/lib/jobs';
import { geocodeAddress } from '@/lib/geocoding';
import { publicMapboxToken } from '@/lib/tracking';

// Geocoded fresh, in memory, for this one request only — never written
// to the job row (that's reserved for an actual EN_ROUTE trip,
// lib/tracking.ts). Any crew member on the job can ask for directions,
// not just the lead (unlike live location sharing, which is lead-only).
export async function GET(_req: Request, { params }: { params: { jobId: string } }) {
  const viewer = viewerFrom(await getServerSession(authOptions));
  const data = await loadJob(params.jobId);
  if (!data || !(await canWorkJob(viewer, data.job))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const address = data.address;
  if (!address) return NextResponse.json({ destination: null, addressLabel: null, mapboxToken: publicMapboxToken() });

  const addressLabel = `${address.line1}, ${address.city}, ${address.state}${address.zip ? ` ${address.zip}` : ''}`;
  const destination = await geocodeAddress(addressLabel);
  return NextResponse.json({ destination, addressLabel, mapboxToken: publicMapboxToken() });
}
