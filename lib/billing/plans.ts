/**
 * TrashCan plans — the one source of truth for prices, fees and allowances.
 * The pricing page, the signup flow, Plan & credits, the platform fee on
 * card payments and the credit wallet all read this file; change a number
 * here and every surface (and every future charge) follows.
 *
 * Model (docs/billing.md): the software is free. TrashCan earns a small fee
 * on card payments a company collects through TrashCan, or a flat monthly
 * price that lowers or removes that fee. Texting and Tex phone minutes are
 * prepaid credits, so a company's usage is always paid for before it
 * happens. All money is integer cents.
 */

export type PlanKey = 'FREE' | 'CREW' | 'TEAM';

export type Plan = {
  key: PlanKey;
  name: string;
  monthlyCents: number;
  /** Platform fee on card payments, in basis points (100 = 1%). */
  feeBps: number;
  includedTexts: number;
  includedVoiceMinutes: number;
  tagline: string;
  onboarding: string;
  /** Stripe lookup key for the subscription price (paid plans only). */
  lookupKey?: string;
};

export const PLANS: Record<PlanKey, Plan> = {
  FREE: {
    key: 'FREE',
    name: 'Free',
    monthlyCents: 0,
    feeBps: 100,
    includedTexts: 0,
    includedVoiceMinutes: 0,
    tagline: 'Run the whole business for $0 a month. Pay only when your clients pay you by card.',
    onboarding: 'Self-serve, plus a free client import',
  },
  CREW: {
    key: 'CREW',
    name: 'Crew',
    monthlyCents: 4900,
    feeBps: 50,
    includedTexts: 500,
    includedVoiceMinutes: 60,
    tagline: 'For growing companies taking more card payments.',
    onboarding: 'Self-serve, plus a free client import',
    lookupKey: 'trashcan_crew_monthly_v1',
  },
  TEAM: {
    key: 'TEAM',
    name: 'Team',
    monthlyCents: 12900,
    feeBps: 0,
    includedTexts: 1500,
    includedVoiceMinutes: 200,
    tagline: 'One flat price. No platform fee, ever.',
    onboarding: 'Done-for-you setup',
    lookupKey: 'trashcan_team_monthly_v1',
  },
};

export const PLAN_ORDER: PlanKey[] = ['FREE', 'CREW', 'TEAM'];

/** Usage rates, all plans, once the included allowance is used. */
export const USAGE = {
  smsSegmentCents: 2,
  voiceMinuteCents: 25,
  phoneNumberMonthlyCents: 200,
  textingSetupCents: 4900,
  /** Tex won't pick up a call without at least this many minutes covered. */
  voiceMinMinutesToAnswer: 2,
  topUpOptionsCents: [2000, 5000, 10000],
  autoTopUpThresholdCents: 500,
  autoTopUpAmountCents: 2000,
} as const;

/** Per-company guardrails (editable by the platform owner only). */
export const GUARDRAILS = {
  maxTextsPerDay: 3000,
  maxVoiceMinutesPerMonth: 500,
} as const;

/**
 * What Stripe itself charges on a card payment the platform carries, so the
 * platform fee can cover it on charges routed through the platform's own
 * account (Express accounts with destination charges). 2.9% + 30¢ is
 * Stripe's US standard card rate, plus 0.25% for Express payouts. On a
 * company's own Standard account (direct charges) Stripe bills the company
 * directly and this is zero. Override with STRIPE_PASSTHROUGH_BPS /
 * STRIPE_PASSTHROUGH_FIXED_CENTS if your Stripe pricing differs.
 */
export function stripePassthrough() {
  return {
    bps: Number(process.env.STRIPE_PASSTHROUGH_BPS ?? 315),
    fixedCents: Number(process.env.STRIPE_PASSTHROUGH_FIXED_CENTS ?? 30),
  };
}

export function planFor(key: string | null | undefined): Plan {
  return PLANS[(key as PlanKey) in PLANS ? (key as PlanKey) : 'FREE'];
}

/** The platform's fee on a card payment of `amountCents`, by plan. */
export function platformFeeOnly(plan: Plan, amountCents: number, feeExempt = false) {
  if (feeExempt || amountCents <= 0) return 0;
  return Math.round((amountCents * plan.feeBps) / 10000);
}

/** What one month costs a company on `plan` at `cardVolumeCents` of card payments. */
export function monthlyCostCents(plan: Plan, cardVolumeCents: number) {
  return plan.monthlyCents + Math.round((Math.max(0, cardVolumeCents) * plan.feeBps) / 10000);
}

/** The cheapest plan for a month's card volume (ties go to the cheaper subscription). */
export function bestPlanFor(cardVolumeCents: number): { plan: Plan; costCents: number; costs: Record<PlanKey, number> } {
  const costs = Object.fromEntries(PLAN_ORDER.map((k) => [k, monthlyCostCents(PLANS[k], cardVolumeCents)])) as Record<PlanKey, number>;
  const key = PLAN_ORDER.reduce((best, k) => (costs[k] < costs[best] ? k : best), 'FREE' as PlanKey);
  return { plan: PLANS[key], costCents: costs[key], costs };
}

export function feeLabel(plan: Plan) {
  if (plan.feeBps === 0) return 'No platform fee';
  const pct = plan.feeBps / 100;
  return `${Number.isInteger(pct) ? pct.toFixed(0) : pct.toFixed(1)}% on card payments`;
}

export function dollars(cents: number, opts: { cents?: boolean } = {}) {
  const v = cents / 100;
  return v.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: opts.cents ? 2 : 0,
    maximumFractionDigits: opts.cents ? 2 : 0,
  });
}

/** SMS segments for a message body (GSM-7: 160, or 153 per part; UCS-2: 70, or 67 per part). */
export function smsSegments(body: string) {
  // eslint-disable-next-line no-control-regex
  const gsm = /^[\n\r -_a-zA-Z0-9@£$¥èéùìòÇØøÅåΔΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,./:;<=>?¡ÄÖÑÜ§¿äöñüà^{}\\[~\]|€]*$/.test(body);
  const len = [...body].length;
  if (len === 0) return 1;
  if (gsm) return len <= 160 ? 1 : Math.ceil(len / 153);
  return len <= 70 ? 1 : Math.ceil(len / 67);
}

/**
 * The plan a company is actually on right now: a house account and an
 * active promo both count as Team; otherwise whatever it pays for.
 */
export function effectivePlanKey(t: { plan: string | null; planCompUntil?: Date | null; planCompForever?: boolean | null; billingExempt?: boolean | null }): PlanKey {
  if (t.billingExempt) return 'TEAM';
  if (t.planCompForever) return 'TEAM';
  if (t.planCompUntil && t.planCompUntil.getTime() > Date.now()) return 'TEAM';
  return planFor(t.plan).key;
}
