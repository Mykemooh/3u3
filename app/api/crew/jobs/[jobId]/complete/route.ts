import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { completeJob, viewerFrom } from '@/lib/jobs';
import { apiError } from '@/lib/api';

// Finish the job: validates every room, marks it complete, drafts the
// invoice, and emails the client their before-and-after link (lib/jobs.ts).
export async function POST(req: Request, { params }: { params: { jobId: string } }) {
  try {
    const body = await req.json().catch(() => ({}));
    const position = body?.position && typeof body.position.lat === 'number' && typeof body.position.lng === 'number' ? body.position : null;
    const result = await completeJob(params.jobId, viewerFrom(await getServerSession(authOptions)), position);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return apiError(err);
  }
}
