import { z } from 'zod';

/**
 * What a post-construction or commercial lead tells us before the
 * walkthrough. These are the questions that change the price and the
 * plan — square footage, which phases (or how many visits a week), what
 * the floors are, whether trades are still on site, who supplies the
 * restroom paper — so the walkthrough confirms details instead of
 * starting from nothing. Stored as JSON on the walkthrough booking
 * (bookings.intakeJson) and shown on the lead and the quote.
 *
 * No database imports: the request form uses this file too.
 */

export const POST_CON_PHASES = [
  { key: 'ROUGH', label: 'Rough clean', detail: 'While trades are finishing: debris out, heavy dust down, before cabinets and fixtures go in.' },
  { key: 'FINAL', label: 'Final clean', detail: 'After construction ends: every surface top to bottom, stickers and film off, ready for inspection or move-in.' },
  { key: 'TOUCH_UP', label: 'Touch-up clean', detail: 'Right before handover or move-in: the dust that settled since the final clean.' },
] as const;
export type PostConPhase = (typeof POST_CON_PHASES)[number]['key'];

export const PROJECT_TYPES = [
  ['NEW_BUILD', 'New build'],
  ['RENOVATION', 'Renovation or addition'],
  ['REMODEL', 'Kitchen or bath remodel'],
  ['OTHER', 'Something else'],
] as const;

export const FLOOR_TYPES = [
  ['HARDWOOD', 'Hardwood'],
  ['TILE', 'Tile or stone'],
  ['VINYL', 'Vinyl or laminate'],
  ['CARPET', 'Carpet'],
  ['CONCRETE', 'Sealed concrete'],
] as const;

export const FACILITY_TYPES = [
  ['OFFICE', 'Office'],
  ['MEDICAL', 'Medical or dental'],
  ['RETAIL', 'Retail or showroom'],
  ['FITNESS', 'Gym or studio'],
  ['SCHOOL_CHILDCARE', 'School or childcare'],
  ['CHURCH', 'Church or venue'],
  ['OTHER', 'Something else'],
] as const;

export const TIMES_OF_DAY = [
  ['AFTER_HOURS', 'After hours'],
  ['BUSINESS_HOURS', 'During business hours'],
  ['WEEKENDS', 'Weekends'],
  ['FLEXIBLE', 'Flexible'],
] as const;

export const COMMERCIAL_EXTRAS = [
  ['BREAK_ROOM', 'Break room or kitchen'],
  ['SHOWERS', 'Showers or locker rooms'],
  ['EXAM_ROOMS', 'Exam or treatment rooms'],
  ['GLASS', 'Lots of glass or storefront'],
  ['HIGH_DUSTING', 'High dusting (vents, beams)'],
  ['FLOOR_CARE', 'Floor care (strip & wax, carpet shampoo)'],
] as const;

const keys = <T extends readonly (readonly [string, string])[]>(list: T) => list.map((x) => x[0]) as unknown as [T[number][0], ...T[number][0][]];
const optionalText = (max: number) => z.string().trim().max(max).optional().transform((v) => v || undefined);

export const postConstructionIntake = z.object({
  kind: z.literal('POST_CONSTRUCTION'),
  projectType: z.enum(keys(PROJECT_TYPES)),
  squareFeet: z.number().int().min(200).max(200_000),
  stories: z.number().int().min(1).max(10).optional(),
  phases: z.array(z.enum(['ROUGH', 'FINAL', 'TOUCH_UP'])).min(1),
  readyDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  tradesOnSite: z.boolean().optional(),
  utilitiesOn: z.enum(['YES', 'NO', 'NOT_SURE']).optional(),
  floors: z.array(z.enum(keys(FLOOR_TYPES))).max(5).default([]),
  builder: optionalText(120),
  siteContact: optionalText(160),
  notes: optionalText(1000),
});

export const commercialIntake = z.object({
  kind: z.literal('COMMERCIAL'),
  businessName: z.string().trim().min(1).max(120),
  facilityType: z.enum(keys(FACILITY_TYPES)),
  squareFeet: z.number().int().min(200).max(500_000),
  restrooms: z.number().int().min(0).max(100).optional(),
  // 0 = a one-time clean.
  visitsPerWeek: z.number().int().min(0).max(7),
  timeOfDay: z.enum(keys(TIMES_OF_DAY)).optional(),
  floors: z.array(z.enum(keys(FLOOR_TYPES))).max(5).default([]),
  extras: z.array(z.enum(keys(COMMERCIAL_EXTRAS))).max(6).default([]),
  suppliesBy: z.enum(['US', 'CLIENT', 'NOT_SURE']).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  hasCurrentCleaner: z.boolean().optional(),
  siteContact: optionalText(160),
  notes: optionalText(1000),
});

export const intakeSchema = z.discriminatedUnion('kind', [postConstructionIntake, commercialIntake]);
export type Intake = z.infer<typeof intakeSchema>;
export type PostConstructionIntake = z.infer<typeof postConstructionIntake>;
export type CommercialIntake = z.infer<typeof commercialIntake>;

/** Which service keys ask the extra questions. */
export const INTAKE_KINDS = ['POST_CONSTRUCTION', 'COMMERCIAL'] as const;
export const needsIntake = (serviceKey: string | null | undefined) => (INTAKE_KINDS as readonly string[]).includes(serviceKey ?? '');

export function parseIntake(json: string | null | undefined): Intake | null {
  if (!json) return null;
  try {
    const parsed = intakeSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

const label = (list: readonly (readonly [string, string])[], key: string | undefined) => list.find((x) => x[0] === key)?.[1] ?? key ?? '';
const yesNo = (v: boolean | undefined) => (v == null ? undefined : v ? 'Yes' : 'No');
const date = (d: string | undefined) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : undefined);

/** Plain-words rows for the lead, the walkthrough and the quote. */
export function describeIntake(intake: Intake): { label: string; value: string }[] {
  const rows: [string, string | undefined][] =
    intake.kind === 'POST_CONSTRUCTION'
      ? [
          ['Project', label(PROJECT_TYPES, intake.projectType)],
          ['Size', `${intake.squareFeet.toLocaleString()} sq ft${intake.stories ? `, ${intake.stories} ${intake.stories === 1 ? 'story' : 'stories'}` : ''}`],
          ['Phases', intake.phases.map((p) => POST_CON_PHASES.find((x) => x.key === p)!.label).join(', ')],
          ['Site ready', date(intake.readyDate)],
          ['Trades still on site', yesNo(intake.tradesOnSite)],
          ['Power and water on', intake.utilitiesOn ? { YES: 'Yes', NO: 'No', NOT_SURE: 'Not sure' }[intake.utilitiesOn] : undefined],
          ['Floors', intake.floors.map((f) => label(FLOOR_TYPES, f)).join(', ') || undefined],
          ['Builder', intake.builder],
          ['Site contact', intake.siteContact],
          ['Notes', intake.notes],
        ]
      : [
          ['Business', intake.businessName],
          ['Facility', label(FACILITY_TYPES, intake.facilityType)],
          ['Size', `${intake.squareFeet.toLocaleString()} sq ft${intake.restrooms != null ? `, ${intake.restrooms} restroom${intake.restrooms === 1 ? '' : 's'}` : ''}`],
          ['How often', intake.visitsPerWeek === 0 ? 'One-time clean' : `${intake.visitsPerWeek} visit${intake.visitsPerWeek === 1 ? '' : 's'} a week`],
          ['When', intake.timeOfDay ? label(TIMES_OF_DAY, intake.timeOfDay) : undefined],
          ['Floors', intake.floors.map((f) => label(FLOOR_TYPES, f)).join(', ') || undefined],
          ['Also needs', intake.extras.map((e) => label(COMMERCIAL_EXTRAS, e)).join(', ') || undefined],
          ['Restroom supplies', intake.suppliesBy ? { US: 'We supply', CLIENT: 'They supply', NOT_SURE: 'Not sure yet' }[intake.suppliesBy] : undefined],
          ['Start', date(intake.startDate)],
          ['Has a cleaner now', yesNo(intake.hasCurrentCleaner)],
          ['Site contact', intake.siteContact],
          ['Notes', intake.notes],
        ];
  return rows.filter((r): r is [string, string] => !!r[1]).map(([l, v]) => ({ label: l, value: v }));
}
