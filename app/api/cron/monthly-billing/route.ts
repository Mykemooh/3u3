import { NextResponse } from 'next/server';
import { recordHeartbeat } from '@/lib/health';
import { closeDueMonthlyBatches } from '@/lib/monthlyBilling';

export const dynamic = 'force-dynamic';

/**
 * Daily cron (vercel.json → crons): closes any MONTHLY_BATCH client's
 * billing batch whose calendar month has actually ended, invoicing (and
 * autopay-charging) every cleaning completed that month in one shot.
 * Same CRON_SECRET bearer-token gate as the other cron routes.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 401 });
  }
  try {
    const result = await closeDueMonthlyBatches();
    await recordHeartbeat('cron:monthly-billing', true, result);
    return NextResponse.json(result);
  } catch (err) {
    await recordHeartbeat('cron:monthly-billing', false, String(err));
    throw err;
  }
}
