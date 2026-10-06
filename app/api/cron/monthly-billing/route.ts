import { NextResponse } from 'next/server';
import { recordHeartbeat } from '@/lib/health';
import { closeDueMonthlyBatches } from '@/lib/monthlyBilling';
import { runBillingDaily } from '@/lib/billing/daily';

export const dynamic = 'force-dynamic';

/**
 * Daily cron (vercel.json → crons): closes any MONTHLY_BATCH client's
 * billing batch whose calendar month has actually ended, invoicing (and
 * autopay-charging) every cleaning completed that month in one shot —
 * then TRASHCAN's own daily billing (lib/billing/daily.ts).
 * Same CRON_SECRET bearer-token gate as the other cron routes.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 401 });
  }
  try {
    const result = await closeDueMonthlyBatches();
    // TRASHCAN's own daily billing: allowances, the business number (lib/billing/daily.ts).
    const platform = await runBillingDaily().catch((err) => {
      console.error('[cron] platform billing failed', err);
      return null;
    });
    await recordHeartbeat('cron:monthly-billing', true, { ...result, platform });
    return NextResponse.json({ ...result, platform });
  } catch (err) {
    await recordHeartbeat('cron:monthly-billing', false, String(err));
    throw err;
  }
}
