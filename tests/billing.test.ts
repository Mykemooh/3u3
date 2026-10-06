import { test } from 'node:test';
import assert from 'node:assert/strict';
import type Stripe from 'stripe';
import { db, seeded } from './helpers/fixtures';
import { tenants, wallets, walletLedger, promoCodes } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { PLANS, bestPlanFor, monthlyCostCents, smsSegments, effectivePlanKey, feeLabel } from '@/lib/billing/plans';
import { applicationFeeCents } from '@/lib/connect';
import {
  chargeUsage,
  refundCharge,
  creditTopUp,
  getWallet,
  resetAllowance,
  withUsage,
  startVoiceCall,
  continueVoiceCall,
  affordableVoiceMinutes,
  adjustBalance,
} from '@/lib/billing/wallet';
import { handleBillingEvent } from '@/lib/billing/stripeBilling';
import { redeemPromoCode, isPlatformAccessActive } from '@/lib/platform';
import { runBillingDaily } from '@/lib/billing/daily';

async function company(name = 'Billing Co') {
  const id = crypto.randomUUID();
  await db.insert(tenants).values({ id, name, slug: `bill-${id.slice(0, 8)}`, planStatus: 'ACTIVE' });
  return id;
}
const ledgerSum = async (tenantId: string) =>
  Number((await db.select({ s: sql<number>`coalesce(sum(${walletLedger.amountCents}),0)` }).from(walletLedger).where(eq(walletLedger.tenantId, tenantId)))[0].s);
const event = (type: string, object: unknown) => ({ id: `evt_${crypto.randomUUID()}`, type, data: { object } }) as unknown as Stripe.Event;

test('plans: prices, fees and the cheapest plan for a month', () => {
  assert.equal(PLANS.FREE.monthlyCents, 0);
  assert.equal(feeLabel(PLANS.FREE), '1% on card payments');
  assert.equal(feeLabel(PLANS.CREW), '0.5% on card payments');
  assert.equal(feeLabel(PLANS.TEAM), 'No platform fee');
  assert.equal(monthlyCostCents(PLANS.FREE, 1_000_000), 10_000, '$10k on Free is $100');
  assert.equal(bestPlanFor(0).plan.key, 'FREE');
  assert.equal(bestPlanFor(500_000).plan.key, 'FREE', '$5k: Free ($50) beats Crew ($74)');
  assert.equal(bestPlanFor(1_200_000).plan.key, 'CREW', '$12k: Crew ($109) beats Free ($120)');
  assert.equal(bestPlanFor(2_000_000).plan.key, 'TEAM', '$20k: Team ($129) beats Crew ($149)');
  assert.equal(smsSegments('Hi'), 1);
  assert.equal(smsSegments('x'.repeat(161)), 2);
  assert.equal(smsSegments('Café 😊'), 1, 'unicode: 70 per segment');
});

test('platform fee: pass-through plus the plan fee, none on tips, none for a house account', () => {
  // $200 on Free: Stripe pass-through (3.15% + 30¢ = $6.60) + 1% ($2.00).
  assert.equal(applicationFeeCents(20000, { plan: 'FREE' }), 660 + 200);
  assert.equal(applicationFeeCents(20000, { plan: 'CREW' }), 660 + 100);
  assert.equal(applicationFeeCents(20000, { plan: 'TEAM' }), 660);
  assert.equal(applicationFeeCents(20000, { plan: 'FREE', kind: 'TIP' }), 660, 'no platform fee on a tip');
  assert.equal(applicationFeeCents(20000, { plan: 'FREE', exempt: true }), 660, 'house account pays only what Stripe charges');
  assert.equal(applicationFeeCents(0, { plan: 'FREE' }), 0);
  assert.equal(effectivePlanKey({ plan: 'FREE', billingExempt: true }), 'TEAM');
  assert.equal(effectivePlanKey({ plan: 'FREE', planCompUntil: new Date(Date.now() + 86400000) }), 'TEAM');
  assert.equal(effectivePlanKey({ plan: 'CREW', planCompUntil: new Date(Date.now() - 1000) }), 'CREW');
});

test('wallet: allowance first, then credits, never below zero; failures refund', async () => {
  const t = await company();
  assert.deepEqual(await chargeUsage(t, 'SMS', 1), { ok: false, why: 'NO_CREDITS' }, 'nothing to spend yet');

  await resetAllowance(t, 'CREW');
  let w = await getWallet(t);
  assert.equal(w.includedTextsRemaining, 500);
  const fromAllowance = await chargeUsage(t, 'SMS', 2);
  assert.ok(fromAllowance.ok && fromAllowance.cents === 0 && fromAllowance.fromAllowance === 2);

  await db.update(wallets).set({ includedTextsRemaining: 1 }).where(eq(wallets.tenantId, t));
  assert.equal(await creditTopUp(t, 1000, 'pi_test_1'), true);
  assert.equal(await creditTopUp(t, 1000, 'pi_test_1'), false, 'the same payment is never credited twice');
  const split = await chargeUsage(t, 'SMS', 3);
  assert.ok(split.ok && split.fromAllowance === 1 && split.cents === 4, '1 from allowance, 2 paid at 2¢');
  w = await getWallet(t);
  assert.equal(w.balanceCents, 996);

  await refundCharge(t, 'SMS', split, 3);
  w = await getWallet(t);
  assert.equal(w.balanceCents, 1000);
  assert.equal(w.includedTextsRemaining, 1);

  const failed = await withUsage(t, 'SMS', 1, async () => ({ ok: false }), (r) => r.ok);
  assert.equal(failed.charged, true);
  w = await getWallet(t);
  assert.equal(w.balanceCents, 1000, 'a send that failed costs nothing');
  assert.equal(w.includedTextsRemaining, 1);

  assert.equal(await ledgerSum(t), w.balanceCents, 'ledger always adds up to the balance');
});

test('wallet: concurrent sends can never overdraw', async () => {
  const t = await company('Race Co');
  await creditTopUp(t, 10, 'pi_race');
  const results = await Promise.all(Array.from({ length: 20 }, () => chargeUsage(t, 'SMS', 1)));
  assert.equal(results.filter((r) => r.ok).length, 5, '10¢ buys exactly five 2¢ texts');
  const w = await getWallet(t);
  assert.equal(w.balanceCents, 0);
  assert.equal(await ledgerSum(t), 0);
});

test('house account (3U3): never blocked, never charged, still logged', async () => {
  const { tenant } = await seeded();
  assert.equal(tenant.billingExempt, true, '3U3 is seeded as the platform owner’s house account');
  assert.equal(tenant.plan, 'TEAM');
  const r = await chargeUsage(tenant.id, 'SMS', 3);
  assert.ok(r.ok && r.cents === 0);
  assert.equal(await affordableVoiceMinutes(tenant.id), Number.POSITIVE_INFINITY);
  assert.equal((await getWallet(tenant.id)).balanceCents, 0);
});

test('Tex phone calls: two minutes reserved up front, more as the call runs, wrapped up when credits end', async () => {
  const t = await company('Voice Co');
  assert.equal(await startVoiceCall(t, 'CA1'), false, 'no credits, no answer');
  await creditTopUp(t, 75, 'pi_voice');
  assert.equal(await startVoiceCall(t, 'CA2'), true);
  assert.equal((await getWallet(t)).balanceCents, 25, 'two minutes at 25¢ reserved');
  assert.equal(await continueVoiceCall(t, 'CA2'), true, 'still inside what’s paid');
  await db.execute(sql`update voice_calls set started_at = now() - interval '150 seconds' where call_sid = 'CA2'`);
  assert.equal(await continueVoiceCall(t, 'CA2'), false, 'minute four can’t be covered');
});

test('Stripe events: plan checkout, renewal, lapse to Free, top-up, duplicates', async () => {
  const t = await company('Sub Co');
  await db.update(tenants).set({ platformStripeCustomerId: 'cus_x' }).where(eq(tenants.id, t));

  assert.equal(await handleBillingEvent(event('checkout.session.completed', { metadata: { tenantId: t, kind: 'TC_PLAN', plan: 'CREW' }, subscription: 'sub_1' })), true);
  let row = (await db.select().from(tenants).where(eq(tenants.id, t)))[0];
  assert.equal(row.plan, 'CREW');
  assert.equal(row.platformStripeSubscriptionId, 'sub_1');
  assert.equal((await getWallet(t)).includedTextsRemaining, 500);

  await handleBillingEvent(event('customer.subscription.updated', { id: 'sub_1', status: 'active', metadata: { tenantId: t }, items: { data: [{ price: { lookup_key: 'trashcan_team_monthly_v1' } }] } }));
  row = (await db.select().from(tenants).where(eq(tenants.id, t)))[0];
  assert.equal(row.plan, 'TEAM', 'an upgrade made in Stripe follows the price');
  assert.equal((await getWallet(t)).includedTextsRemaining, 1500);

  await handleBillingEvent(event('customer.subscription.deleted', { id: 'sub_1', status: 'canceled', metadata: { tenantId: t }, items: { data: [] } }));
  row = (await db.select().from(tenants).where(eq(tenants.id, t)))[0];
  assert.equal(row.plan, 'FREE', 'a lapsed plan is Free — never locked');
  assert.equal(row.platformStripeSubscriptionId, null);
  assert.equal(isPlatformAccessActive(row), true);

  const pi = { id: 'pi_topup_9', amount: 2000, amount_received: 2000, metadata: { tenantId: t, kind: 'TC_TOPUP' }, payment_method: null };
  assert.equal(await handleBillingEvent(event('payment_intent.succeeded', pi)), true);
  assert.equal(await handleBillingEvent(event('payment_intent.succeeded', pi)), true);
  assert.equal((await getWallet(t)).balanceCents, 2000, 'the same top-up arriving twice credits once');

  assert.equal(await handleBillingEvent(event('invoice.paid', { subscription: null })), false, 'client invoices are left to lib/invoices.ts');
});

test('promo codes grant a complimentary Team plan; the daily job keeps allowances topped up', async () => {
  const t = await company('Promo Co');
  const { admin } = await seeded();
  await db.insert(promoCodes).values({ id: crypto.randomUUID(), code: 'TEAM90', tier: 'TRIAL_3MO', durationDays: 90, createdByUserId: admin.id });
  await redeemPromoCode(t, 'team90');
  const row = (await db.select().from(tenants).where(eq(tenants.id, t)))[0];
  assert.equal(effectivePlanKey(row), 'TEAM');
  assert.equal(row.plan, 'FREE', 'what they pay for is unchanged');
  assert.equal((await getWallet(t)).includedVoiceMinutesRemaining, 200);

  await db.update(wallets).set({ allowanceResetAt: new Date(Date.now() - 31 * 86400000), includedTextsRemaining: 3 }).where(eq(wallets.tenantId, t));
  const out = await runBillingDaily();
  assert.ok(out.allowancesReset >= 1);
  assert.equal((await getWallet(t)).includedTextsRemaining, 1500);
});

test('the business number: charged monthly from credits, suspended when they run out', async () => {
  const t = await company('Number Co');
  await db.insert(wallets).values({ tenantId: t, textingStatus: 'ACTIVE', numberPaidThrough: new Date(Date.now() - 1000) }).onConflictDoNothing();
  await creditTopUp(t, 200, 'pi_number');
  await runBillingDaily();
  let w = await getWallet(t);
  assert.equal(w.balanceCents, 0);
  assert.equal(w.textingStatus, 'ACTIVE');
  assert.ok(w.numberPaidThrough! > new Date());

  await db.update(wallets).set({ numberPaidThrough: new Date(Date.now() - 1000) }).where(eq(wallets.tenantId, t));
  await runBillingDaily();
  w = await getWallet(t);
  assert.equal(w.textingStatus, 'SUSPENDED');
  assert.equal(await adjustBalance(t, 500, 'goodwill'), 500);
  assert.equal(await ledgerSum(t), (await getWallet(t)).balanceCents);
});
