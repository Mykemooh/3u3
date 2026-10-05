import { db } from '@/db/client';
import { automationSends } from '@/db/schema';
import { scheduleTemplates, serviceTypes } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import type { Pattern } from '@/lib/recurring';
import { z } from 'zod';

/**
 * Schedule templates: everything a kind of clean usually needs — service,
 * length, arrival window, repeat pattern, preferred start, team size and
 * notes — so booking one is client, template, date. Every company starts
 * with a starter set built from its own services (edit, copy, rename or
 * delete any of them).
 */

export type Template = typeof scheduleTemplates.$inferSelect;
export type TemplatePattern = 'ONE_TIME' | Pattern;

export class TemplateError extends Error {
  status = 400;
}

const STARTERS: Record<string, { name: string; pattern: TemplatePattern; start: number; window: number; teamSize: number; notes: string; color: string }[]> = {
  STANDARD: [{ name: 'Standard clean — every 2 weeks, morning', pattern: 'EVERY_2_WEEKS', start: 9 * 60, window: 60, teamSize: 2, notes: 'Regular maintenance clean on the standard checklist.', color: '#016AEE' }],
  DEEP: [{ name: 'Deep clean — one-time', pattern: 'ONE_TIME', start: 8 * 60, window: 60, teamSize: 3, notes: 'Baseboards, inside microwave, grout detail. First visits often run longer.', color: '#0157C4' }],
  MOVE_IN_OUT: [{ name: 'Move-in / move-out — empty home', pattern: 'ONE_TIME', start: 8 * 60, window: 30, teamSize: 3, notes: 'Inside cabinets, oven and fridge. Confirm utilities are on.', color: '#18AA9D' }],
  AIRBNB: [{ name: 'Airbnb turnover — between guests', pattern: 'ONE_TIME', start: 11 * 60, window: 0, teamSize: 2, notes: 'Must finish before the next check-in. Stage linens, restock, damage check.', color: '#2DBD91' }],
  POST_CONSTRUCTION: [
    { name: 'Post-construction — rough clean', pattern: 'ONE_TIME', start: 8 * 60, window: 30, teamSize: 3, notes: 'Debris, stickers, packaging and heavy dust. Bring HEPA vacuums.', color: '#F59E0B' },
    { name: 'Post-construction — final clean', pattern: 'ONE_TIME', start: 8 * 60, window: 30, teamSize: 3, notes: 'Glass, fixtures, ledges, trim and residue. Walk the punch list with the builder.', color: '#D97706' },
    { name: 'Post-construction — touch-up', pattern: 'ONE_TIME', start: 9 * 60, window: 60, teamSize: 2, notes: 'Return after inspections and trades. Fingerprints and dust.', color: '#B45309' },
  ],
  COMMERCIAL: [{ name: 'Commercial — weekly, after hours', pattern: 'WEEKLY', start: 18 * 60, window: 30, teamSize: 2, notes: 'Check in and out with the site contact. Alarm code is on the property profile.', color: '#041730' }],
};

/**
 * Starter templates per service line. A line gets its starters once — the
 * first time it has none (so lines added later, like post-construction
 * and commercial, get theirs too) — and never again, so templates an
 * owner deletes stay deleted (claimed in automation_sends).
 */
export async function ensureStarterTemplates(tenantId: string) {
  const existing = await db.select().from(scheduleTemplates).where(eq(scheduleTemplates.tenantId, tenantId));
  const services = await db.select().from(serviceTypes).where(eq(serviceTypes.tenantId, tenantId));
  // A company that already has templates only gets starters for the lines
  // added since (anything else it deleted on purpose).
  const LATER_LINES = ['POST_CONSTRUCTION', 'COMMERCIAL'];
  const missing = services.filter(
    (svc) => (STARTERS[svc.key] ?? []).length && !existing.some((t) => t.serviceTypeId === svc.id) && (existing.length === 0 || LATER_LINES.includes(svc.key)),
  );
  if (!missing.length) return existing;
  let order = existing.reduce((m, t) => Math.max(m, t.sortOrder + 1), 0);
  for (const svc of missing) {
    if (!(await claimOnce(tenantId, 'starter_templates', svc.id))) continue;
    for (const t of STARTERS[svc.key] ?? []) {
      await db.insert(scheduleTemplates).values({
        id: crypto.randomUUID(),
        tenantId,
        name: t.name,
        serviceTypeId: svc.id,
        durationMinutes: svc.defaultDurationMinutes,
        arrivalWindowMinutes: t.window,
        pattern: t.pattern,
        preferredStartMinutes: t.start,
        teamSize: t.teamSize,
        notes: t.notes,
        color: t.color,
        sortOrder: order++,
      });
    }
  }
  return db.select().from(scheduleTemplates).where(eq(scheduleTemplates.tenantId, tenantId));
}

async function claimOnce(tenantId: string, key: string, refId: string) {
  const rows = await db.insert(automationSends).values({ id: crypto.randomUUID(), tenantId, key, refId }).onConflictDoNothing().returning({ id: automationSends.id });
  return rows.length > 0;
}

export async function listTemplates(tenantId: string) {
  const rows = await ensureStarterTemplates(tenantId);
  return [...rows].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export type TemplateInput = {
  name: string;
  serviceTypeId: string | null;
  durationMinutes: number;
  arrivalWindowMinutes: number;
  pattern: TemplatePattern;
  weekdays?: string | null;
  preferredStartMinutes: number;
  defaultCrewId?: string | null;
  teamSize?: number | null;
  notes?: string | null;
  color?: string | null;
};

function check(input: TemplateInput) {
  if (!input.name.trim()) throw new TemplateError('Give the template a name.');
  if (input.durationMinutes < 15 || input.durationMinutes > 16 * 60) throw new TemplateError('Length should be between 15 minutes and 16 hours.');
  if (input.preferredStartMinutes < 0 || input.preferredStartMinutes >= 24 * 60) throw new TemplateError('Pick a start time.');
  if (input.arrivalWindowMinutes < 0 || input.arrivalWindowMinutes > 8 * 60) throw new TemplateError('The arrival window is too long.');
}

export async function saveTemplate(tenantId: string, input: TemplateInput, id?: string): Promise<Template> {
  check(input);
  const values = {
    name: input.name.trim(),
    serviceTypeId: input.serviceTypeId,
    durationMinutes: Math.round(input.durationMinutes),
    arrivalWindowMinutes: Math.round(input.arrivalWindowMinutes),
    pattern: input.pattern,
    weekdays: input.pattern === 'CUSTOM_WEEKDAYS' ? input.weekdays ?? null : null,
    preferredStartMinutes: Math.round(input.preferredStartMinutes),
    defaultCrewId: input.defaultCrewId ?? null,
    teamSize: input.teamSize ?? null,
    notes: input.notes ?? null,
    color: input.color ?? null,
  };
  if (id) {
    const res = await db.update(scheduleTemplates).set(values).where(and(eq(scheduleTemplates.id, id), eq(scheduleTemplates.tenantId, tenantId))).returning();
    if (!res[0]) throw Object.assign(new TemplateError('Template not found.'), { status: 404 });
    return res[0];
  }
  const newId = crypto.randomUUID();
  await db.insert(scheduleTemplates).values({ id: newId, tenantId, ...values, sortOrder: 100 });
  return (await db.select().from(scheduleTemplates).where(eq(scheduleTemplates.id, newId)).limit(1))[0]!;
}

export async function deleteTemplate(tenantId: string, id: string) {
  await db.delete(scheduleTemplates).where(and(eq(scheduleTemplates.id, id), eq(scheduleTemplates.tenantId, tenantId)));
}

export async function copyTemplate(tenantId: string, id: string) {
  const t = (await db.select().from(scheduleTemplates).where(and(eq(scheduleTemplates.id, id), eq(scheduleTemplates.tenantId, tenantId))).limit(1))[0];
  if (!t) throw Object.assign(new TemplateError('Template not found.'), { status: 404 });
  return saveTemplate(tenantId, { ...t, name: `${t.name} (copy)` });
}

export const templateSchema = z.object({
  name: z.string().min(1).max(80),
  serviceTypeId: z.string().nullable(),
  durationMinutes: z.number().int(),
  arrivalWindowMinutes: z.number().int(),
  pattern: z.enum(['ONE_TIME', 'WEEKLY', 'EVERY_2_WEEKS', 'EVERY_4_WEEKS', 'MONTHLY_NTH_WEEKDAY', 'CUSTOM_WEEKDAYS']),
  weekdays: z.string().nullish(),
  preferredStartMinutes: z.number().int(),
  defaultCrewId: z.string().nullish(),
  teamSize: z.number().int().min(1).max(20).nullish(),
  notes: z.string().max(1000).nullish(),
  color: z.string().max(20).nullish(),
});
