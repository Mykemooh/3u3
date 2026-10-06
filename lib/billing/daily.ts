import { and, eq, isNotNull, lt, or, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { tenants, wallets } from '@/db/schema';
import { USAGE, effectivePlanKey } from '@/lib/billing/plans';
import { chargeFixed, ensureWallet, resetAllowance } from '@/lib/billing/wallet';
import { notifyCompanyAdmins, notifyPlatformOwners } from '@/lib/billing/notices';

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Once a day (app/api/cron/monthly-billing):
 *  • monthly allowance for companies on Team without a Stripe subscription
 *    (house accounts and promo codes) — paid plans reset on their renewal;
 *  • a promo that ran out drops the allowance back to the paid plan's;
 *  • the business number's $2 a month from credits, suspending it when
 *    credits can't cover it and releasing it after 30 unpaid days, so the
 *    platform never carries a number.
 */
export async function runBillingDaily() {
  const out = { allowancesReset: 0, numbersCharged: 0, numbersSuspended: 0, numbersReleased: 0 };
  const now = new Date();
  const rows = await db.select().from(tenants).where(eq(tenants.isPlatform, false));

  for (const t of rows) {
    await ensureWallet(t.id);
    const w = (await db.select().from(wallets).where(eq(wallets.tenantId, t.id)).limit(1))[0]!;
    const effective = effectivePlanKey(t);
    const comped = effective === 'TEAM' && !t.platformStripeSubscriptionId;
    const due = !w.allowanceResetAt || now.getTime() - w.allowanceResetAt.getTime() >= MONTH_MS;
    if (comped && due) {
      await resetAllowance(t.id, 'TEAM');
      out.allowancesReset += 1;
    }
    // A promo ended since yesterday: back to the plan they pay for.
    if (t.planCompUntil && t.planCompUntil < now && now.getTime() - t.planCompUntil.getTime() < 36 * 60 * 60 * 1000 && !t.billingExempt && !t.planCompForever) {
      await resetAllowance(t.id, t.plan);
      await notifyCompanyAdmins(t.id, 'PROMO_ENDED', 'Your complimentary Team plan has ended', `You’re back on the ${t.plan === 'FREE' ? 'Free' : t.plan === 'CREW' ? 'Crew' : 'Team'} plan. Nothing is locked — everything keeps working.`, { label: 'Plan & credits', path: '/admin/plan' });
    }
  }

  // The business number, month by month.
  const numbers = await db
    .select()
    .from(wallets)
    .where(and(or(eq(wallets.textingStatus, 'ACTIVE'), eq(wallets.textingStatus, 'REGISTERING')), or(isNull(wallets.numberPaidThrough), lt(wallets.numberPaidThrough, now))));
  for (const w of numbers) {
    const ok = await chargeFixed(w.tenantId, 'PHONE_NUMBER', USAGE.phoneNumberMonthlyCents, `number-${now.toISOString().slice(0, 7)}`);
    if (ok) {
      const next = new Date(Math.max(now.getTime(), w.numberPaidThrough?.getTime() ?? 0));
      next.setUTCMonth(next.getUTCMonth() + 1);
      await db.update(wallets).set({ numberPaidThrough: next, updatedAt: now }).where(eq(wallets.tenantId, w.tenantId));
      out.numbersCharged += 1;
    } else {
      await db.update(wallets).set({ textingStatus: 'SUSPENDED', updatedAt: now }).where(eq(wallets.tenantId, w.tenantId));
      await notifyCompanyAdmins(w.tenantId, 'NUMBER_SUSPENDED', 'Your business number is paused', 'Your texting credits couldn’t cover this month’s $2 for your business number, so it’s paused. Add credits within 30 days to keep the number.', { label: 'Add credits', path: '/admin/plan' });
      out.numbersSuspended += 1;
    }
  }

  // Suspended for 30 days: give the number back.
  const lapsed = await db
    .select()
    .from(wallets)
    .where(and(eq(wallets.textingStatus, 'SUSPENDED'), isNotNull(wallets.numberPaidThrough), lt(wallets.numberPaidThrough, new Date(now.getTime() - MONTH_MS))));
  for (const w of lapsed) {
    const t = (await db.select().from(tenants).where(eq(tenants.id, w.tenantId)).limit(1))[0];
    await db.update(wallets).set({ textingStatus: 'NONE', updatedAt: now }).where(eq(wallets.tenantId, w.tenantId));
    if (t?.smsNumber) {
      await db.update(tenants).set({ smsNumber: null }).where(eq(tenants.id, w.tenantId));
      await notifyPlatformOwners(`Release number ${t.smsNumber}`, `${t.name}'s business number ${t.smsNumber} went 30 days unpaid. It has been removed from the company — release it in Twilio so it stops costing the platform.`);
    }
    out.numbersReleased += 1;
  }
  return out;
}

/** A suspended number comes back as soon as there are credits for it. */
export async function resumeSuspendedNumber(tenantId: string) {
  const w = (await db.select().from(wallets).where(eq(wallets.tenantId, tenantId)).limit(1))[0];
  if (!w || w.textingStatus !== 'SUSPENDED') return false;
  const ok = await chargeFixed(tenantId, 'PHONE_NUMBER', USAGE.phoneNumberMonthlyCents, `number-resume-${Date.now()}`);
  if (!ok) return false;
  const next = new Date();
  next.setUTCMonth(next.getUTCMonth() + 1);
  await db.update(wallets).set({ textingStatus: 'ACTIVE', numberPaidThrough: next, updatedAt: new Date() }).where(eq(wallets.tenantId, tenantId));
  return true;
}
