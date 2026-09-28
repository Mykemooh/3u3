import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { viewerFrom } from '@/lib/jobs';
import { startDriving, isValidLngLat } from '@/lib/tracking';
import { apiError } from '@/lib/api';

// The crew taps "Start driving": moves the job to EN_ROUTE, stamps the
// time and tells the client they're on the way. The body may carry the
// phone's current { lat, lng } so the first email can include an ETA.
export async function POST(req: Request, { params }: { params: { jobId: string } }) {
  try {
    const body = await req.json().catch(() => null);
    const at = isValidLngLat(body) ? { lat: body.lat, lng: body.lng } : null;
    const result = await startDriving(params.jobId, viewerFrom(await getServerSession(authOptions)), at);
    return NextResponse.json(result);
  } catch (err) {
    return apiError(err);
  }
}
