import { and, eq, gte } from 'drizzle-orm';
import { db } from '@/db/client';
import { invoices } from '@/db/schema';
import { getTenant } from '@/lib/data';
import { getWallet, ledgerFor, usageThisMonth } from '@/lib/billing/wallet';
import { PLANS, USAGE, bestPlanFor, effectivePlanKey, monthlyCostCents, type PlanKey } from '@/lib/billing/plans';
import { isStripeConfigured } from '@/lib/stripe';
import PlanCredits from '@/components/admin/PlanCredits';

export const dynamic = 'force-dynamic';

/** Settings → Plan & credits: what the company pays TRASHCAN, and its prepaid usage. */
export default async function PlanPage({ searchParams }: { searchParams: { plan?: string; credits?: string; texting?: string } }) {
  const tenant = await getTenant();
  if (!tenant) return null;
  const since = new Date(Date.now() - 30 * 86400000);
  const [wallet, ledger, usage, paid] = await Promise.all([
    getWallet(tenant.id),
    ledgerFor(tenant.id, 40),
    usageThisMonth(tenant.id),
    db.select({ total: invoices.totalCents }).from(invoices).where(and(eq(invoices.tenantId, tenant.id), eq(invoices.status, 'PAID'), gte(invoices.paidAt, since))),
  ]);
  const cardVolumeCents = paid.reduce((s, i) => s + i.total, 0);
  const effective = effectivePlanKey(tenant);
  const best = bestPlanFor(cardVolumeCents);
  let intakePlan: PlanKey | null = null;
  try {
    const p = JSON.parse(tenant.intakeJson ?? '{}').plan;
    if (p === 'CREW' || p === 'TEAM') intakePlan = p;
  } catch {
    /* no intake */
  }

  const comp = tenant.planCompForever ? 'forever' : tenant.planCompUntil && tenant.planCompUntil > new Date() ? tenant.planCompUntil.toISOString() : null;

  return (
    <PlanCredits
      flash={searchParams.plan === 'updated' ? 'Your plan is updated.' : searchParams.credits === 'added' ? 'Thanks — your credits will appear in a moment.' : searchParams.texting === 'paid' ? 'Thanks — we’re setting up your business number.' : null}
      stripeReady={isStripeConfigured()}
      company={tenant.name}
      exempt={tenant.billingExempt}
      plan={tenant.plan as PlanKey}
      effective={effective}
      comp={comp}
      subscribed={!!tenant.platformStripeSubscriptionId}
      hasCustomer={!!tenant.platformStripeCustomerId}
      intakePlan={tenant.plan === 'FREE' ? intakePlan : null}
      cardVolumeCents={cardVolumeCents}
      best={{ key: best.plan.key, costCents: best.costCents, currentCostCents: monthlyCostCents(PLANS[effective], cardVolumeCents) }}
      smsNumber={tenant.smsNumber}
      wallet={{
        balanceCents: wallet.balanceCents,
        includedTexts: wallet.includedTextsRemaining,
        includedMinutes: wallet.includedVoiceMinutesRemaining,
        autoTopUp: wallet.autoTopUpEnabled,
        autoAmountCents: wallet.autoTopUpAmountCents,
        autoThresholdCents: wallet.autoTopUpThresholdCents,
        card: wallet.cardLast4 ? `${wallet.cardBrand ?? 'Card'} •••• ${wallet.cardLast4}` : null,
        textingStatus: wallet.textingStatus,
        numberPaidThrough: wallet.numberPaidThrough?.toISOString() ?? null,
      }}
      usage={usage}
      ledger={ledger.map((r) => ({ id: r.id, at: r.createdAt.toISOString(), type: r.type, reason: r.reason, quantity: r.quantity, amountCents: r.amountCents, balanceAfterCents: r.balanceAfterCents, note: r.note }))}
      rates={{ sms: USAGE.smsSegmentCents, voice: USAGE.voiceMinuteCents, number: USAGE.phoneNumberMonthlyCents, setup: USAGE.textingSetupCents, topUps: [...USAGE.topUpOptionsCents] }}
    />
  );
}
