import { z } from 'zod';

/**
 * Pricing helpers for the two lines that aren't priced per home:
 * post-construction (per square foot, per phase) and commercial (labor
 * hours from a production rate, turned into a monthly contract).
 *
 * The ranges are the commonly published US ranges, shown to the owner as
 * a guide inside the quote editor — never to clients, never as a promise.
 * Every number is editable before the quote goes out.
 */

export type Range = { low: number; high: number; suggested: number };

/** Dollars per square foot, per phase. */
export const POST_CON_RATE_GUIDE: Record<'ROUGH' | 'FINAL' | 'TOUCH_UP', Range> = {
  ROUGH: { low: 0.15, high: 0.4, suggested: 0.2 },
  FINAL: { low: 0.2, high: 0.6, suggested: 0.3 },
  TOUCH_UP: { low: 0.2, high: 0.6, suggested: 0.2 },
};

/**
 * Square feet one cleaner cleans in an hour. Office and medical have
 * published ranges; anything else starts from the office figure and the
 * owner adjusts it after the walkthrough.
 */
export const PRODUCTION_RATE_GUIDE: Record<string, Range & { guided: boolean }> = {
  OFFICE: { low: 3000, high: 4000, suggested: 3500, guided: true },
  MEDICAL: { low: 1500, high: 2500, suggested: 2000, guided: true },
};
export const productionGuideFor = (facility: string | undefined) => PRODUCTION_RATE_GUIDE[facility ?? ''] ?? { ...PRODUCTION_RATE_GUIDE.OFFICE, guided: false };

export const WEEKS_PER_MONTH = 52 / 12;

const roundQuarter = (h: number) => Math.round(h * 4) / 4;

export type PostConPhaseLine = { key: 'ROUGH' | 'FINAL' | 'TOUCH_UP'; label: string; ratePerSqFt: number; amountCents: number };

export function postConstructionPrice(input: { squareFeet: number; phases: { key: 'ROUGH' | 'FINAL' | 'TOUCH_UP'; label: string; ratePerSqFt: number }[] }) {
  const phases: PostConPhaseLine[] = input.phases.map((p) => ({ ...p, amountCents: Math.round(input.squareFeet * p.ratePerSqFt * 100) }));
  return { squareFeet: input.squareFeet, phases, totalCents: phases.reduce((s, p) => s + p.amountCents, 0) };
}

export function commercialPrice(input: {
  squareFeet: number;
  productionRate: number;
  visitsPerWeek: number;
  hourlyRateCents: number;
  suppliesMonthlyCents?: number;
}) {
  if (!(input.productionRate > 0)) throw new Error('Production rate must be above zero');
  const hoursPerVisit = Math.max(1, roundQuarter(input.squareFeet / input.productionRate));
  const visitCents = Math.round(hoursPerVisit * input.hourlyRateCents);
  if (input.visitsPerWeek <= 0) {
    return { hoursPerVisit, visitsPerMonth: 0, laborMonthlyCents: 0, suppliesMonthlyCents: 0, monthlyCents: 0, perVisitCents: visitCents };
  }
  const visitsPerMonth = Math.round(input.visitsPerWeek * WEEKS_PER_MONTH * 100) / 100;
  const laborMonthlyCents = Math.round(visitCents * input.visitsPerWeek * WEEKS_PER_MONTH);
  const suppliesMonthlyCents = Math.max(0, Math.round(input.suppliesMonthlyCents ?? 0));
  const monthlyCents = laborMonthlyCents + suppliesMonthlyCents;
  return {
    hoursPerVisit,
    visitsPerMonth,
    laborMonthlyCents,
    suppliesMonthlyCents,
    monthlyCents,
    // What each visit is billed at, so a month of visits adds up to the monthly price.
    perVisitCents: Math.round(monthlyCents / (input.visitsPerWeek * WEEKS_PER_MONTH)),
  };
}

export type QuotePricing =
  | { kind: 'POST_CONSTRUCTION'; squareFeet: number; phases: PostConPhaseLine[] }
  | {
      kind: 'COMMERCIAL';
      squareFeet: number;
      productionRate: number;
      visitsPerWeek: number;
      hourlyRateCents: number;
      hoursPerVisit: number;
      suppliesMonthlyCents: number;
      monthlyCents: number;
      perVisitCents: number;
    };

export function parsePricing(json: string | null | undefined): QuotePricing | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json);
    return v && (v.kind === 'POST_CONSTRUCTION' || v.kind === 'COMMERCIAL') ? (v as QuotePricing) : null;
  } catch {
    return null;
  }
}

export const pricingSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('POST_CONSTRUCTION'),
    squareFeet: z.number().int().min(1).max(500_000),
    phases: z
      .array(z.object({ key: z.enum(['ROUGH', 'FINAL', 'TOUCH_UP']), label: z.string().max(60), ratePerSqFt: z.number().min(0).max(10), amountCents: z.number().int().min(0) }))
      .min(1)
      .max(3),
  }),
  z.object({
    kind: z.literal('COMMERCIAL'),
    squareFeet: z.number().int().min(1).max(500_000),
    productionRate: z.number().min(100).max(20_000),
    visitsPerWeek: z.number().int().min(0).max(7),
    hourlyRateCents: z.number().int().min(0).max(100_000),
    hoursPerVisit: z.number().min(0).max(100),
    suppliesMonthlyCents: z.number().int().min(0).max(10_000_000),
    monthlyCents: z.number().int().min(0),
    perVisitCents: z.number().int().min(0),
  }),
]);
