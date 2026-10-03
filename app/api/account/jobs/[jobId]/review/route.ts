import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { loadJob, canViewJob, viewerFrom } from '@/lib/jobs';
import { submitReview, ReviewError } from '@/lib/reviews';

const schema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(2000).optional(),
});

// Rate a finished cleaning from the client's before-and-after gallery
// (app/account/jobs/[id]) — one review per booking.
export async function POST(req: Request, { params }: { params: { jobId: string } }) {
  const viewer = viewerFrom(await getServerSession(authOptions));
  if (!viewer || viewer.role !== 'CUSTOMER') return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const data = await loadJob(params.jobId);
  if (!data || !(await canViewJob(viewer, data.job, data.booking))) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (data.job.status !== 'COMPLETE') return NextResponse.json({ error: 'This cleaning isn\'t finished yet.' }, { status: 400 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Pick a star rating from 1 to 5.' }, { status: 400 });

  try {
    await submitReview({
      tenantId: data.booking.tenantId,
      bookingId: data.booking.id,
      clientId: viewer.id,
      rating: parsed.data.rating,
      comment: parsed.data.comment,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ReviewError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error('[review] submit failed', err);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
