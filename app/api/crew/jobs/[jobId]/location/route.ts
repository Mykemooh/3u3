import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { viewerFrom } from '@/lib/jobs';
import { recordLocation, isValidLngLat } from '@/lib/tracking';
import { apiError } from '@/lib/api';

// Position report from the crew's phone while en route, every ~20s.
// Responds { tracking: false } once the trip is over so the phone stops.
export async function POST(req: Request, { params }: { params: { jobId: string } }) {
  try {
    const body = await req.json().catch(() => null);
    if (!isValidLngLat(body)) return NextResponse.json({ error: 'Send { lat, lng } as numbers.' }, { status: 400 });
    const result = await recordLocation(params.jobId, viewerFrom(await getServerSession(authOptions)), { lat: body.lat, lng: body.lng });
    return NextResponse.json(result);
  } catch (err) {
    return apiError(err);
  }
}
