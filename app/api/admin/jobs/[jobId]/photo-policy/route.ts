import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { setPhotoPolicy, viewerFrom } from '@/lib/jobs';
import { apiError } from '@/lib/api';
import { adminSession, forbidden } from '@/lib/adminApi';

/** Admin-only: require a before photo, or skip photo documentation for this job entirely. */
export async function POST(req: Request, { params }: { params: { jobId: string } }) {
  if (!(await adminSession())) return forbidden();
  try {
    const viewer = viewerFrom(await getServerSession(authOptions));
    const body = await req.json().catch(() => ({}));
    const result = await setPhotoPolicy(params.jobId, viewer, {
      requireBeforePhoto: typeof body.requireBeforePhoto === 'boolean' ? body.requireBeforePhoto : undefined,
      noPhotosNeeded: typeof body.noPhotosNeeded === 'boolean' ? body.noPhotosNeeded : undefined,
    });
    return NextResponse.json(result);
  } catch (err) {
    return apiError(err);
  }
}
