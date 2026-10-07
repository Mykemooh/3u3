import { z } from 'zod';

/**
 * How a company prices a home clean (Settings → Quoting). Each method is a
 * switch; its own options only matter, and only show, when it's on.
 *
 *   Base price — how the clean itself is priced (one or more):
 *     ROOMS   a base price plus so much per bedroom and bathroom
 *     SQFT    a rate per square foot, with a minimum
 *     HOURLY  an hourly rate per cleaner, with a minimum of hours
 *     WALKTHROUGH  seen in person first, priced by hand (no numbers)
 *   Adjustments — applied on top of the base price:
 *     CLUTTER    how lived-in the home is: a % for light / average / heavy
 *     PETS       so much per pet
 *     FREQUENCY  a % off for weekly / every-two-weeks / monthly visits
 *     DEEP       a % more when the service is a deep or move-in/out clean
 *
 * Post-construction and commercial keep their own calculators
 * (lib/pricingGuides.ts); a company that offers them can set its own
 * starting rates here, which the calculator then opens with.
 *
 * Nothing here is ever shown to a client: it fills the line items of an
 * estimate the owner reviews and sends.
 */

export const BASE_METHODS = ['ROOMS', 'SQFT', 'HOURLY', 'WALKTHROUGH'] as const;
export type BaseMethod = (typeof BASE_METHODS)[number];
export const CLUTTER_LEVELS = ['LIGHT', 'AVERAGE', 'HEAVY'] as const;
export type ClutterLevel = (typeof CLUTTER_LEVELS)[number];
export const FREQUENCIES = ['ONE_TIME', 'WEEKLY', 'BIWEEKLY', 'MONTHLY'] as const;
export type Frequency = (typeof FREQUENCIES)[number];

const money = z.number().int().min(0).max(10_000_00); // cents, up to $10,000
const pct = z.number().min(0).max(300);

export const quotingSchema = z.object({
  rooms: z.object({ on: z.boolean(), baseCents: money, perBedroomCents: money, perBathroomCents: money }),
  sqft: z.object({ on: z.boolean(), centsPerSqFt: z.number().min(0).max(1000), minimumCents: money }),
  hourly: z.object({ on: z.boolean(), rateCents: money, minimumHours: z.number().min(0).max(24) }),
  walkthrough: z.object({ on: z.boolean() }),
  clutter: z.object({ on: z.boolean(), lightPct: pct, averagePct: pct, heavyPct: pct }),
  pets: z.object({ on: z.boolean(), perPetCents: money }),
  frequency: z.object({ on: z.boolean(), weeklyPct: z.number().min(0).max(90), biweeklyPct: z.number().min(0).max(90), monthlyPct: z.number().min(0).max(90) }),
  deep: z.object({ on: z.boolean(), extraPct: pct }),
  postConstruction: z.object({ roughPerSqFt: z.number().min(0).max(10), finalPerSqFt: z.number().min(0).max(10), touchUpPerSqFt: z.number().min(0).max(10) }),
  commercial: z.object({ sqFtPerHour: z.number().min(100).max(20_000), hourlyRateCents: money }),
});
export type QuotingConfig = z.infer<typeof quotingSchema>;

/**
 * Starting numbers: plain, editable, and never shown to clients. They sit
 * inside the commonly published US ranges for residential cleaning.
 */
export const DEFAULT_QUOTING: QuotingConfig = {
  rooms: { on: false, baseCents: 10000, perBedroomCents: 2000, perBathroomCents: 2500 },
  sqft: { on: false, centsPerSqFt: 10, minimumCents: 12000 },
  hourly: { on: false, rateCents: 5000, minimumHours: 2 },
  walkthrough: { on: false },
  clutter: { on: false, lightPct: 0, averagePct: 15, heavyPct: 35 },
  pets: { on: false, perPetCents: 1000 },
  frequency: { on: false, weeklyPct: 15, biweeklyPct: 10, monthlyPct: 5 },
  deep: { on: false, extraPct: 50 },
  postConstruction: { roughPerSqFt: 0.2, finalPerSqFt: 0.3, touchUpPerSqFt: 0.2 },
  commercial: { sqFtPerHour: 3500, hourlyRateCents: 4500 },
};

/** A company's saved settings, filled out with defaults for anything missing; null when never saved. */
export function parseQuoting(json: string | null | undefined): QuotingConfig | null {
  if (!json) return null;
  try {
    const raw = JSON.parse(json);
    const merged = Object.fromEntries(
      Object.entries(DEFAULT_QUOTING).map(([k, v]) => [k, { ...v, ...(raw && typeof raw[k] === 'object' ? raw[k] : {}) }]),
    );
    const parsed = quotingSchema.safeParse(merged);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Before the owner has saved anything: switch on what they told us at
 * signup (lib/signup.ts, "How do you price a job today?").
 */
export function quotingFromSignup(pricing: string | undefined): QuotingConfig {
  const c: QuotingConfig = JSON.parse(JSON.stringify(DEFAULT_QUOTING));
  if (pricing === 'FLAT_BY_SIZE') c.rooms.on = true;
  else if (pricing === 'HOURLY') c.hourly.on = true;
  else if (pricing === 'WALKTHROUGH') c.walkthrough.on = true;
  else c.rooms.on = true;
  c.clutter.on = true;
  c.frequency.on = true;
  return c;
}

export function quotingForTenant(t: { quotingJson?: string | null; intakeJson?: string | null }): { config: QuotingConfig; saved: boolean } {
  const saved = parseQuoting(t.quotingJson);
  if (saved) return { config: saved, saved: true };
  let pricing: string | undefined;
  try {
    pricing = t.intakeJson ? JSON.parse(t.intakeJson).pricing : undefined;
  } catch {
    pricing = undefined;
  }
  return { config: quotingFromSignup(pricing), saved: false };
}

/** The base methods that produce a number (WALKTHROUGH doesn't). */
export function pricedMethods(c: QuotingConfig): Exclude<BaseMethod, 'WALKTHROUGH'>[] {
  return (['ROOMS', 'SQFT', 'HOURLY'] as const).filter((m) => (m === 'ROOMS' ? c.rooms.on : m === 'SQFT' ? c.sqft.on : c.hourly.on));
}

export type QuoteInputs = {
  method: Exclude<BaseMethod, 'WALKTHROUGH'>;
  bedrooms?: number;
  bathrooms?: number;
  squareFeet?: number;
  hours?: number;
  cleaners?: number;
  clutter?: ClutterLevel;
  pets?: number;
  frequency?: Frequency;
  deep?: boolean;
};

export type QuoteLine = { description: string; amountCents: number };

const fmtMoney = (c: number) => `$${(c / 100).toFixed(2)}`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Turns a home's details into estimate lines using the company's settings.
 * Percent adjustments are worked out on the base price; the repeat-visit
 * discount comes last, on the total, spread across the lines (estimates
 * never carry a negative line). Every line is rounded to the cent, never
 * below zero, and the lines always add up to the total.
 */
export function quoteFromConfig(c: QuotingConfig, input: QuoteInputs, serviceName: string): { lines: QuoteLine[]; totalCents: number } {
  const lines: QuoteLine[] = [];
  let base = 0;

  if (input.method === 'ROOMS') {
    const beds = Math.max(0, Math.round(input.bedrooms ?? 0));
    const baths = Math.max(0, Math.round((input.bathrooms ?? 0) * 2) / 2);
    base = c.rooms.baseCents + beds * c.rooms.perBedroomCents + Math.round(baths * c.rooms.perBathroomCents);
    lines.push({ description: `${serviceName} — ${plural(beds, 'bedroom', 'bedrooms')}, ${plural(baths, 'bathroom', 'bathrooms')}`, amountCents: base });
  } else if (input.method === 'SQFT') {
    const sq = Math.max(0, Math.round(input.squareFeet ?? 0));
    const raw = Math.round(sq * c.sqft.centsPerSqFt);
    base = Math.max(raw, c.sqft.minimumCents);
    lines.push({
      description: raw < c.sqft.minimumCents ? `${serviceName} — ${sq.toLocaleString('en-US')} sq ft (minimum price)` : `${serviceName} — ${sq.toLocaleString('en-US')} sq ft`,
      amountCents: base,
    });
  } else {
    const cleaners = Math.max(1, Math.round(input.cleaners ?? 1));
    const hours = Math.max(c.hourly.minimumHours, Math.round((input.hours ?? 0) * 4) / 4);
    base = Math.round(hours * cleaners * c.hourly.rateCents);
    lines.push({ description: `${serviceName} — ${hours} h × ${plural(cleaners, 'cleaner', 'cleaners')}`, amountCents: base });
  }

  if (c.deep.on && input.deep && c.deep.extraPct > 0) {
    lines.push({ description: `Deep clean (+${c.deep.extraPct}%)`, amountCents: Math.round((base * c.deep.extraPct) / 100) });
  }
  if (c.clutter.on && input.clutter) {
    const p = input.clutter === 'LIGHT' ? c.clutter.lightPct : input.clutter === 'AVERAGE' ? c.clutter.averagePct : c.clutter.heavyPct;
    if (p > 0) lines.push({ description: `${input.clutter === 'LIGHT' ? 'Light' : input.clutter === 'AVERAGE' ? 'Average' : 'Heavy'} clutter (+${p}%)`, amountCents: Math.round((base * p) / 100) });
  }
  if (c.pets.on && (input.pets ?? 0) > 0) {
    const n = Math.round(input.pets!);
    lines.push({ description: `Pets (${n} × ${fmtMoney(c.pets.perPetCents)})`, amountCents: n * c.pets.perPetCents });
  }
  if (c.frequency.on && input.frequency && input.frequency !== 'ONE_TIME') {
    const p = input.frequency === 'WEEKLY' ? c.frequency.weeklyPct : input.frequency === 'BIWEEKLY' ? c.frequency.biweeklyPct : c.frequency.monthlyPct;
    if (p > 0) {
      // Estimates carry no negative lines, so the discount is taken off
      // every line in proportion and said once, on the main line.
      const subtotal = lines.reduce((s, l) => s + l.amountCents, 0);
      const target = subtotal - Math.round((subtotal * p) / 100);
      let running = 0;
      lines.forEach((l, i) => {
        l.amountCents = i === lines.length - 1 ? target - running : Math.round((l.amountCents * (100 - p)) / 100);
        running += l.amountCents;
      });
      const label = input.frequency === 'WEEKLY' ? 'weekly' : input.frequency === 'BIWEEKLY' ? 'every two weeks' : 'monthly';
      lines[0].description += ` (${label}: ${p}% off applied)`;
    }
  }
  return { lines, totalCents: lines.reduce((s, l) => s + l.amountCents, 0) };
}
