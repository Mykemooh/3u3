import { and, eq, isNull, isNotNull, lte, inArray, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { jobMedia, jobs } from '@/db/schema';
import { deleteStored, type MediaKind } from '@/lib/storage';

/**
 * How long photos and videos stick around, and a hard safety net that
 * trims the oldest finished-job media if total storage creeps toward
 * the account's actual limit — Vercel Blob's free (Hobby) tier is a
 * hard 1 GB cap, and going over it doesn't bill, it locks out *all*
 * Blob access (new uploads, reads, everything) for 30 days. Both the
 * day-based expiry and the budget sweep run from the same daily cron
 * (app/api/cron/media-cleanup) and only ever touch media from COMPLETE
 * jobs — nothing still being worked is ever at risk.
 *
 * Defaults apply even with no env var set, unlike the general pattern
 * elsewhere in this app of "unset = off": media storage is the one
 * place where doing nothing by default risks an account-wide outage,
 * so there's a sensible default instead. Set either env var to "0" to
 * disable that piece explicitly.
 */

const DEFAULT_PHOTO_RETENTION_DAYS = 180; // 6 months — photos compress to ~300 KB, so this is cheap to keep
const DEFAULT_VIDEO_RETENTION_DAYS = 30; // videos are the heaviest single files by far
const DEFAULT_STORAGE_BUDGET_MB = 800; // leaves ~200 MB of headroom under Blob's 1 GB hard cap

function days(envVar: string, fallback: number): number | null {
  const raw = process.env[envVar];
  const n = raw !== undefined ? Number(raw) : fallback;
  return !n || n < 1 ? null : n;
}

/** Computed once, at upload time, and stored on the row — see lib/jobs.ts addMedia(). */
export function mediaExpiry(kind: MediaKind): Date | null {
  const n = kind === 'VIDEO' ? days('VIDEO_RETENTION_DAYS', DEFAULT_VIDEO_RETENTION_DAYS) : days('PHOTO_RETENTION_DAYS', DEFAULT_PHOTO_RETENTION_DAYS);
  return n ? new Date(Date.now() + n * 24 * 60 * 60 * 1000) : null;
}

/** Deletes anything (photo or video) whose stored expiresAt has passed. */
export async function cleanupExpiredMedia(limit = 500): Promise<{ deleted: number }> {
  const due = await db
    .select()
    .from(jobMedia)
    .where(and(isNull(jobMedia.deletedAt), isNotNull(jobMedia.expiresAt), lte(jobMedia.expiresAt, new Date())))
    .limit(limit);
  for (const m of due) {
    await deleteStored({ key: m.storageKey, url: m.url });
    await db.update(jobMedia).set({ deletedAt: new Date() }).where(eq(jobMedia.id, m.id));
  }
  return { deleted: due.length };
}

/**
 * The safety net: if total stored bytes are over budget, delete the
 * oldest media from finished jobs — regardless of its own expiry date —
 * until back under it. Never touches a job that isn't COMPLETE, so a
 * crew mid-job never loses a photo they just took.
 */
export async function enforceStorageBudget(limit = 500): Promise<{ deleted: number; freedBytes: number }> {
  const budgetMb = Number(process.env.MEDIA_STORAGE_BUDGET_MB || DEFAULT_STORAGE_BUDGET_MB);
  if (!budgetMb || budgetMb < 1) return { deleted: 0, freedBytes: 0 }; // "0" opts out explicitly

  const totalRow = (
    await db.select({ total: sql<string>`coalesce(sum(${jobMedia.sizeBytes}), 0)` }).from(jobMedia).where(isNull(jobMedia.deletedAt))
  )[0];
  let total = Number(totalRow?.total ?? 0);
  const budgetBytes = budgetMb * 1024 * 1024;
  if (total <= budgetBytes) return { deleted: 0, freedBytes: 0 };

  const completeJobIds = (await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.status, 'COMPLETE'))).map((j) => j.id);
  if (completeJobIds.length === 0) return { deleted: 0, freedBytes: 0 };

  const candidates = (
    await db
      .select()
      .from(jobMedia)
      .where(and(isNull(jobMedia.deletedAt), inArray(jobMedia.jobId, completeJobIds)))
  )
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .slice(0, limit);

  let deleted = 0;
  let freedBytes = 0;
  for (const m of candidates) {
    if (total <= budgetBytes) break;
    await deleteStored({ key: m.storageKey, url: m.url });
    await db.update(jobMedia).set({ deletedAt: new Date() }).where(eq(jobMedia.id, m.id));
    total -= m.sizeBytes ?? 0;
    freedBytes += m.sizeBytes ?? 0;
    deleted += 1;
  }
  return { deleted, freedBytes };
}
