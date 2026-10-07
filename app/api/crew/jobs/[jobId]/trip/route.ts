import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { viewerFrom } from '@/lib/jobs';
import { recordTripRoute, recordArrivalFromMap } from '@/lib/trips';
import { apiError } from '@/lib/api';

// The crew app's in-app navigation reports the drive (lib/trips.ts):
// { choiceToken } when navigation starts on a picked route — recorded on
// the trip, and a toll route adds its "Tolls" expense (once per trip, however
// often this is retried) — and { arrived: true } when the map sees them
// arrive. Any crew member on the job may report; it's whoever is driving.
export async function POST(req: Request, { params }: { params: { jobId: string } }) {
  try {
    const body = await req.json().catch(() => ({}));
    const viewer = viewerFrom(await getServerSession(authOptions));
    if (body?.arrived === true) {
      return NextResponse.json({ arrived: await recordArrivalFromMap(params.jobId, viewer) });
    }
    return NextResponse.json(await recordTripRoute(params.jobId, viewer, body?.choiceToken));
  } catch (err) {
    return apiError(err);
  }
}
