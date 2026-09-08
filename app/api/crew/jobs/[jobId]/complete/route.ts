import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/db/client';
import { jobs, jobChecklistItems, bookings } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getCrewForUser } from '@/lib/data';

// A job cannot be marked finished until every checklist item has a
// complete before/after pair, or has been explicitly flagged skipped with
// a reason (PRD 6.5).
export async function POST(req: Request, { params }: { params: { jobId: string } }) {
  const session = await getServerSession(authOptions);
  const role = session?.user ? (session.user as any).role : null;
  if (!role) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const jobRows = await db.select().from(jobs).where(eq(jobs.id, params.jobId)).limit(1);
  const job = jobRows[0];
  if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (role === 'CLEANER') {
    const crew = await getCrewForUser((session!.user as any).id);
    if (!crew || crew.id !== job.crewId) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  } else if (role !== 'ADMIN') {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  }

  const items = await db.select().from(jobChecklistItems).where(eq(jobChecklistItems.jobId, params.jobId));
  const incomplete = items.filter((i) => i.status === 'PENDING');
  if (incomplete.length > 0) {
    return NextResponse.json(
      { error: `${incomplete.length} room(s) still need before/after photos or a skip reason.` },
      { status: 400 },
    );
  }

  const now = new Date();
  await db.update(jobs).set({ status: 'COMPLETE', completedAt: now }).where(eq(jobs.id, params.jobId));
  await db.update(bookings).set({ status: 'COMPLETED' }).where(eq(bookings.id, job.bookingId));

  return NextResponse.json({ ok: true });
}
