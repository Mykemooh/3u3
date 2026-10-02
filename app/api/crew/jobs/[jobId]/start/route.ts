import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { startJob, viewerFrom } from '@/lib/jobs';
import { apiError } from '@/lib/api';

// The crew is on site (from PENDING, or "I've arrived" from EN_ROUTE):
// moves the job to IN_PROGRESS, stamps the start and ends live tracking.
// Photos can't be added until this has happened.
export async function POST(_req: Request, { params }: { params: { jobId: string } }) {
  try {
    const job = await startJob(params.jobId, viewerFrom(await getServerSession(authOptions)));
    return NextResponse.json({ status: job.status, startedAt: job.startedAt });
  } catch (err) {
    return apiError(err);
  }
}
