import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { quotes } from '@/db/schema';
import { optOutOfQuoteReminders } from '@/lib/reminders';
import { companyForTenant } from '@/lib/emailBrand';

// The "stop these reminders" link in every quote follow-up email
// (lib/email.ts estimateReminderEmail). Low-stakes and reversible (just
// flips a flag, nothing about the estimate itself changes), so unlike
// Approve/Decline this is a plain GET rather than needing a page +
// client-side confirm step.
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const found = await optOutOfQuoteReminders(params.token);
  const quote = found ? (await db.select({ tenantId: quotes.tenantId }).from(quotes).where(eq(quotes.approvalToken, params.token)).limit(1))[0] : undefined;
  const name = (await companyForTenant(quote?.tenantId)).name.replace(/[&<>"]/g, '');
  const message = found
    ? "You won't get any more reminders about this estimate. If you change your mind, just reach out to us directly."
    : 'This link is not valid.';
  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><title>${name}</title></head>
     <body style="font-family:sans-serif;color:#0B1F3B;max-width:480px;margin:60px auto;padding:0 20px;">
       <h2 style="color:#1D4ED8;">${name}</h2>
       <p>${message}</p>
     </body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}
