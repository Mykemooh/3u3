import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { completeJob, viewerFrom } from '@/lib/jobs';
import { apiError } from '@/lib/api';

// Finish the job: validates every room, marks it complete, drafts the
// invoice, and emails the client their before-and-after link (lib/jobs.ts).
export async function POST(_req: Request, { params }: { params: { jobId: string } }) {
  try {
    const result = await completeJob(params.jobId, viewerFrom(await getServerSession(authOptions)));
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return apiError(err);
  }
}
