import { NextResponse } from 'next/server';
import { recordHeartbeat } from '@/lib/health';
import { cleanupExpiredMedia, enforceStorageBudget } from '@/lib/mediaRetention';

export const dynamic = 'force-dynamic';

/**
 * Daily clean-up (vercel.json → crons): deletes photos and videos whose
 * retention window has passed (lib/mediaRetention.ts — both have a
 * sensible default even with nothing configured), then, as a safety net,
 * trims the oldest finished-job media if total storage is still over
 * budget. Vercel calls this with the CRON_SECRET bearer token; nobody
 * else can.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 401 });
  }
  try {
    const expired = await cleanupExpiredMedia();
    const budget = await enforceStorageBudget();
    await recordHeartbeat('cron:media-cleanup', true, { expired, budget });
    return NextResponse.json({ expired, budget });
  } catch (err) {
    await recordHeartbeat('cron:media-cleanup', false, String(err));
    throw err;
  }
}
