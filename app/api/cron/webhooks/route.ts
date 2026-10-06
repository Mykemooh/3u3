import { NextResponse } from 'next/server';
import { processDueDeliveries } from '@/lib/webhooks';
import { recordHeartbeat } from '@/lib/health';

export const dynamic = 'force-dynamic';

/**
 * Sends webhook retries that have come due. The daily jobs call the same
 * sweep; any scheduler can call this more often with the CRON_SECRET
 * bearer token (Authorization: Bearer <CRON_SECRET>).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 401 });
  }
  let sent = 0;
  try {
    for (let i = 0; i < 5; i++) {
      const n = await processDueDeliveries({ limit: 50 });
      sent += n;
      if (n < 50) break;
    }
    await recordHeartbeat('cron:webhooks', true, { sent });
  } catch (err) {
    console.error('[cron/webhooks]', err);
    await recordHeartbeat('cron:webhooks', false, { sent });
    return NextResponse.json({ error: 'Sweep failed' }, { status: 500 });
  }
  return NextResponse.json({ sent });
}
