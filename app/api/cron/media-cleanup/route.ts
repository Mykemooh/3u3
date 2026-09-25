import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { jobMedia } from '@/db/schema';
import { and, isNull, isNotNull, lte, eq } from 'drizzle-orm';
import { deleteStored } from '@/lib/storage';

export const dynamic = 'force-dynamic';

/**
 * Daily clean-up (vercel.json → crons). Deletes videos whose retention
 * window has passed — only videos, and only when VIDEO_RETENTION_DAYS is
 * set, so photos are never touched. This is what keeps storage inside the
 * free tier as jobs pile up. Vercel calls it with the CRON_SECRET bearer
 * token; nobody else can.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 401 });
  }
  const due = await db
    .select()
    .from(jobMedia)
    .where(and(eq(jobMedia.kind, 'VIDEO'), isNull(jobMedia.deletedAt), isNotNull(jobMedia.expiresAt), lte(jobMedia.expiresAt, new Date())))
    .limit(500);
  for (const m of due) {
    await deleteStored({ key: m.storageKey, url: m.url });
    await db.update(jobMedia).set({ deletedAt: new Date() }).where(eq(jobMedia.id, m.id));
  }
  return NextResponse.json({ deleted: due.length });
}
