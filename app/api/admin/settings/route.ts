import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db/client';
import { tenants } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { adminSession, forbidden } from '@/lib/adminApi';
import { logChange, diff } from '@/lib/audit';
import { toE164 } from '@/lib/sms';
import { checkSmsNumber, MessagingError } from '@/lib/messaging';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const schema = z.object({
  // Payroll behavior (lib/payroll.ts PayrollSettings).
  percentPayBasis: z.enum(['BASE_PRICE', 'INVOICE_TOTAL']).optional(),
  hourlyPayModel: z.enum(['ACTUAL_TIME', 'TARGET_TIME']).optional(),
  tipSplitMethod: z.enum(['EVEN', 'BY_HOURS']).optional(),
  // Payroll calendar (lib/earnings.ts) — what crew see as "next payout".
  payrollFrequency: z.enum(['WEEKLY', 'BIWEEKLY', 'SEMIMONTHLY', 'MONTHLY']).optional(),
  payrollAnchorDate: date.nullable().optional(),
  // Company profile.
  name: z.string().min(2).max(80).optional(),
  tagline: z.string().max(160).nullable().optional(),
  // Texting and Tex (lib/sms.ts, lib/tex.ts).
  smsNumber: z.string().max(20).nullable().optional(),
  ownerPhone: z.string().max(20).nullable().optional(),
  texSmsAutoReply: z.boolean().optional(),
  texVoiceEnabled: z.boolean().optional(),
  // Growth (lib/marketing.ts).
  googleReviewUrl: z.string().url().max(500).nullable().optional().or(z.literal('')),
  referralCreditCents: z.number().int().min(0).max(100000).optional(),
  winbackDays: z.number().int().min(14).max(365).optional(),
  // Security.
  mfaRequiredForCrew: z.boolean().optional(),
});

// Company settings an owner controls — each defaults to what the app
// already did, so saving one never changes anything else.
export async function PATCH(req: Request) {
  const admin = await adminSession();
  if (!admin) return forbidden();
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
  const data: Record<string, unknown> = { ...parsed.data };
  if (Object.keys(data).length === 0) return NextResponse.json({ ok: true });
  for (const key of ['smsNumber', 'ownerPhone'] as const) {
    if (typeof data[key] === 'string' && data[key]) {
      const e164 = toE164(data[key] as string);
      if (!e164) return NextResponse.json({ error: 'Enter phone numbers as 10 digits, e.g. 281 555 0100.' }, { status: 400 });
      data[key] = e164;
    }
  }
  if (data.googleReviewUrl === '') data.googleReviewUrl = null;
  if (data.smsNumber === '') data.smsNumber = null;
  // A texting number must be on the platform's Twilio account and not
  // another company's — otherwise its texts and calls could be captured.
  if (typeof data.smsNumber === 'string') {
    const current = (await db.select({ smsNumber: tenants.smsNumber }).from(tenants).where(eq(tenants.id, admin.tenantId)).limit(1))[0];
    if (current?.smsNumber !== data.smsNumber) {
      try {
        await checkSmsNumber(admin.tenantId, data.smsNumber);
      } catch (err) {
        if (err instanceof MessagingError) return NextResponse.json({ error: err.message }, { status: 400 });
        throw err;
      }
    }
  }

  const before = (await db.select().from(tenants).where(eq(tenants.id, admin.tenantId)).limit(1))[0]!;
  await db.update(tenants).set(data).where(eq(tenants.id, admin.tenantId));
  const changes = diff(before as unknown as Record<string, unknown>, data);
  if (changes.length) {
    await logChange({
      tenantId: admin.tenantId,
      actor: { id: admin.userId, name: admin.name },
      entityType: 'settings',
      entityId: admin.tenantId,
      action: 'updated',
      summary: 'Changed company settings',
      changes,
    });
  }
  return NextResponse.json({ ok: true });
}
