import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { loadJob, canViewJob, viewerFrom } from '@/lib/jobs';
import { getTracking } from '@/lib/tracking';

export const dynamic = 'force-dynamic';

// What the client's live map polls: the job's status and, while it's
// EN_ROUTE, the crew's position, destination, route and ETA. Reads the
// database only — no Mapbox call per poll (see lib/tracking.ts).
export async function GET(_req: Request, { params }: { params: { jobId: string } }) {
  const viewer = viewerFrom(await getServerSession(authOptions));
  const data = await loadJob(params.jobId);
  if (!data || !(await canViewJob(viewer, data.job, data.booking))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json(getTracking(data.job), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
