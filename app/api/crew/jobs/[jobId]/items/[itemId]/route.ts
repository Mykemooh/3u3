import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/db/client';
import { jobChecklistItems, jobs } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getCrewForUser } from '@/lib/data';
import { saveJobPhoto } from '@/lib/storage';

async function assertAccess(jobId: string, session: any) {
  const role = session?.user ? (session.user as any).role : null;
  if (!role) return { ok: false as const, status: 401 as const };
  const jobRows = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  const job = jobRows[0];
  if (!job) return { ok: false as const, status: 404 as const };
  if (role === 'ADMIN') return { ok: true as const, job };
  if (role === 'CLEANER') {
    const crew = await getCrewForUser((session.user as any).id);
    if (crew && crew.id === job.crewId) return { ok: true as const, job };
  }
  return { ok: false as const, status: 403 as const };
}

export async function POST(req: Request, { params }: { params: { jobId: string; itemId: string } }) {
  const session = await getServerSession(authOptions);
  const access = await assertAccess(params.jobId, session);
  if (!access.ok) return NextResponse.json({ error: 'Not allowed' }, { status: access.status });

  const itemRows = await db.select().from(jobChecklistItems).where(eq(jobChecklistItems.id, params.itemId)).limit(1);
  const item = itemRows[0];
  if (!item || item.jobId !== params.jobId) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const form = await req.formData();
  const kind = form.get('kind') as string; // 'before' | 'after' | 'skip'

  const patch: Partial<typeof jobChecklistItems.$inferInsert> = {};

  if (kind === 'skip') {
    const reason = (form.get('skipReason') as string) || 'No reason given';
    patch.status = 'SKIPPED';
    patch.skipReason = reason;
    patch.completedAt = new Date();
  } else if (kind === 'before' || kind === 'after') {
    const file = form.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'Photo required' }, { status: 400 });

    const publicPath = await saveJobPhoto(file, params.jobId, params.itemId, kind);

    if (kind === 'before') patch.beforePhotoPath = publicPath;
    if (kind === 'after') patch.afterPhotoPath = publicPath;

    const willHaveBefore = kind === 'before' ? publicPath : item.beforePhotoPath;
    const willHaveAfter = kind === 'after' ? publicPath : item.afterPhotoPath;
    if (willHaveBefore && willHaveAfter) {
      patch.status = 'COMPLETE';
      patch.completedAt = new Date();
    } else {
      patch.status = 'PENDING';
    }
  } else {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }

  await db.update(jobChecklistItems).set(patch).where(eq(jobChecklistItems.id, params.itemId));

  // First interaction moves the job from PENDING to IN_PROGRESS.
  if (access.job.status === 'PENDING') {
    await db.update(jobs).set({ status: 'IN_PROGRESS', startedAt: new Date() }).where(eq(jobs.id, params.jobId));
  }

  const updatedRows = await db.select().from(jobChecklistItems).where(eq(jobChecklistItems.id, params.itemId)).limit(1);
  return NextResponse.json({ item: updatedRows[0] });
}
