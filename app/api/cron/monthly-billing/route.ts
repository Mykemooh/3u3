import { NextResponse } from 'next/server';
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
  const result = await closeDueMonthlyBatches();
  return NextResponse.json(result);
}
