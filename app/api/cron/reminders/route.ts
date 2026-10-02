import { NextResponse } from 'next/server';
import { sendBookingReminders, sendQuoteReminders } from '@/lib/reminders';

export const dynamic = 'force-dynamic';

/**
 * Daily cron (vercel.json → crons): upcoming-cleaning reminders (3 days,
 * then 36 hours before) and the quote follow-up cadence (24h, +3d, +2d,
 * then weekly). Same CRON_SECRET bearer-token gate as
 * app/api/cron/media-cleanup/route.ts — only Vercel's scheduler can call
 * this.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 401 });
  }
  const [booking, quote] = await Promise.all([sendBookingReminders(), sendQuoteReminders()]);
  return NextResponse.json({ booking, quote });
}
