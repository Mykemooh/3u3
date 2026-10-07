import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { loadJob, canViewJob, viewerFrom } from '@/lib/jobs';
import { reportProblem } from '@/lib/quality';

const schema = z.object({ note: z.string().trim().min(3).max(2000) });

// "Anything not quite right?" on the client's before-and-after page
// (app/account/jobs/[id]) — tells the owner, who offers a re-clean.
export async function POST(req: Request, { params }: { params: { jobId: string } }) {
  const viewer = viewerFrom(await getServerSession(authOptions));
  if (!viewer || viewer.role !== 'CUSTOMER') return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const data = await loadJob(params.jobId);
  if (!data || !(await canViewJob(viewer, data.job, data.booking))) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (data.job.status !== 'COMPLETE') return NextResponse.json({ error: 'not-finished' }, { status: 400 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'note-required' }, { status: 400 });

  try {
    await reportProblem({ tenantId: data.booking.tenantId, bookingId: data.booking.id, clientId: viewer.id, note: parsed.data.note });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[problem] report failed', err);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
