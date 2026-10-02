import { NextResponse } from 'next/server';
import { optOutOfQuoteReminders } from '@/lib/reminders';

// The "stop these reminders" link in every quote follow-up email
// (lib/email.ts estimateReminderEmail). Low-stakes and reversible (just
// flips a flag, nothing about the estimate itself changes), so unlike
// Approve/Decline this is a plain GET rather than needing a page +
// client-side confirm step.
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const found = await optOutOfQuoteReminders(params.token);
  const message = found
    ? "You won't get any more reminders about this estimate. If you change your mind, just reach out to us directly."
    : 'This link is not valid.';
  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><title>3U3 Cleaning</title></head>
     <body style="font-family:sans-serif;color:#0B1F3B;max-width:480px;margin:60px auto;padding:0 20px;">
       <h2 style="color:#1D4ED8;">3U3 Cleaning</h2>
       <p>${message}</p>
     </body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}
