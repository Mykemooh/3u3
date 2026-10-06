import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { tenants, wallets } from '@/db/schema';
import { superAdminId, forbidden } from '@/lib/adminApi';
import { adjustBalance, ensureWallet, resetAllowance } from '@/lib/billing/wallet';
import { notifyCompanyAdmins } from '@/lib/billing/notices';

const schema = z.object({
  billingExempt: z.boolean().optional(),
  adjustCents: z.number().int().min(-100000).max(100000).optional(),
  note: z.string().trim().max(200).optional(),
  textingLive: z.boolean().optional(),
});

/** Platform owner: house-account status, goodwill credits, and marking a registered number live. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  if (!(await superAdminId())) return forbidden();
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Check the values and try again.' }, { status: 400 });
  const t = (await db.select().from(tenants).where(eq(tenants.id, params.id)).limit(1))[0];
  if (!t || t.isPlatform) return NextResponse.json({ error: 'Company not found.' }, { status: 404 });
  const d = parsed.data;

  if (d.billingExempt !== undefined) {
    await db.update(tenants).set({ billingExempt: d.billingExempt }).where(eq(tenants.id, t.id));
    await resetAllowance(t.id, d.billingExempt ? 'TEAM' : t.plan);
  }
  if (d.adjustCents) {
    if (!d.note) return NextResponse.json({ error: 'Add a note saying why.' }, { status: 400 });
    await adjustBalance(t.id, d.adjustCents, d.note);
  }
  if (d.textingLive) {
    if (!t.smsNumber) return NextResponse.json({ error: 'Add the company’s number first (their Settings → Texting and Tex, or the company form).' }, { status: 400 });
    await ensureWallet(t.id);
    await db.update(wallets).set({ textingStatus: 'ACTIVE', updatedAt: new Date() }).where(eq(wallets.tenantId, t.id));
    await notifyCompanyAdmins(t.id, 'TEXTING_LIVE', 'Your business number is live', `Texting and Tex on the phone now run on ${t.smsNumber}.`, { label: 'Open messages', path: '/admin/messages' });
  }
  return NextResponse.json({ ok: true });
}
