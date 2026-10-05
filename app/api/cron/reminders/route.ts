import { NextResponse } from 'next/server';
import { sendBookingReminders, sendQuoteReminders } from '@/lib/reminders';
import { expireStaleStandbyOffers } from '@/lib/standby';
import { extendAllSeries } from '@/lib/recurring';
import { runAutomations } from '@/lib/automations';

export const dynamic = 'force-dynamic';

/**
 * Daily cron (vercel.json → crons): upcoming-cleaning reminders (3 days,
 * then 36 hours before), the quote follow-up cadence (24h, +3d, +2d, then
 * weekly), and expiring stale standby offers (cascading each to the next
 * person waiting on that date). Same CRON_SECRET bearer-token gate as
 * app/api/cron/media-cleanup/route.ts — only Vercel's scheduler can call
 * this.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 401 });
  }
  // Top up recurring cleans first, so today's new visits get their
  // reminders in the same run.
  const series = await extendAllSeries();
  const [booking, quote, standby] = await Promise.all([sendBookingReminders(), sendQuoteReminders(), expireStaleStandbyOffers()]);
  // The newer reminders and follow-ups (walkthrough, review request,
  // unpaid invoice, win-back) — each off until a company turns it on.
  const automations = await runAutomations().catch((err) => {
    console.error('[cron] automations failed', err);
    return null;
  });
  return NextResponse.json({ series, booking, quote, standby, automations });
}
