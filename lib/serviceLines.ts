import { db } from '@/db/client';
import { serviceTypes, checklistTemplates, checklistTemplateItems, tenants } from '@/db/schema';
import { eq } from 'drizzle-orm';

/**
 * The service lines every company on TrashCan starts with, and the
 * room-by-room (or area-by-area) checklist each one opens with. All of it
 * is editable per company; these are starting points, not rules.
 *
 * Post-construction and commercial were added after the first four, so
 * ensureServiceLines() backfills them for companies that already exist
 * (run on every deploy by scripts/backfill-on-build.ts). A company that
 * doesn't do this work switches the line off in Admin → Services.
 */

export type ServiceLineKey = 'STANDARD' | 'DEEP' | 'MOVE_IN_OUT' | 'AIRBNB' | 'POST_CONSTRUCTION' | 'COMMERCIAL';

export const SERVICE_DEFS: { key: ServiceLineKey; name: string; defaultDurationMinutes: number; recurringEligible: boolean }[] = [
  { key: 'STANDARD', name: 'Standard Cleaning', defaultDurationMinutes: 150, recurringEligible: true },
  { key: 'DEEP', name: 'Deep Cleaning', defaultDurationMinutes: 240, recurringEligible: false },
  { key: 'MOVE_IN_OUT', name: 'Move-In / Move-Out', defaultDurationMinutes: 240, recurringEligible: false },
  { key: 'AIRBNB', name: 'Airbnb / Rental Turnover', defaultDurationMinutes: 150, recurringEligible: false },
  { key: 'POST_CONSTRUCTION', name: 'Post-Construction Cleaning', defaultDurationMinutes: 360, recurringEligible: false },
  { key: 'COMMERCIAL', name: 'Commercial Cleaning', defaultDurationMinutes: 120, recurringEligible: true },
];

export const CHECKLISTS: Record<ServiceLineKey, { room: string; detail: string }[]> = {
  STANDARD: [
    { room: 'Kitchen', detail: 'Wipe counters & backsplash, exterior of appliances, sink, stovetop; empty trash' },
    { room: 'Bathrooms', detail: 'Sanitize toilet, tub/shower, sink & counters; mirrors; empty trash' },
    { room: 'Bedrooms', detail: 'Dust surfaces, make beds, vacuum/mop floors, empty trash' },
    { room: 'Living Areas', detail: 'Dust furniture & surfaces, vacuum/mop floors, tidy visible clutter' },
    { room: 'Entryway & Hallways', detail: 'Sweep/vacuum/mop, dust ledges and light switches' },
  ],
  DEEP: [
    { room: 'Kitchen', detail: 'Standard tasks plus inside microwave, backsplash detail, baseboards, under sink' },
    { room: 'Bathrooms', detail: 'Standard tasks plus grout detail, exhaust fan, baseboards, inside cabinets' },
    { room: 'Bedrooms', detail: 'Standard tasks plus baseboards, light fixtures, door/window frames' },
    { room: 'Living Areas', detail: 'Standard tasks plus baseboards, light fixtures, upholstery vacuum' },
    { room: 'Windows (interior)', detail: 'Interior glass, sills, and tracks' },
    { room: 'Entryway & Hallways', detail: 'Standard tasks plus baseboards and door frames' },
  ],
  MOVE_IN_OUT: [
    { room: 'Kitchen', detail: 'Empty-home deep clean: inside all cabinets/drawers, inside oven/fridge, appliance exteriors' },
    { room: 'Bathrooms', detail: 'Empty-home deep clean: inside cabinets, grout, fixtures, mirrors' },
    { room: 'Bedrooms', detail: 'Inside closets, baseboards, light fixtures, walls spot-clean' },
    { room: 'Living Areas', detail: 'Baseboards, light fixtures, walls spot-clean, floors detail' },
    { room: 'Windows (interior)', detail: 'Interior glass, sills, and tracks' },
    { room: 'Garage / Storage', detail: 'Sweep, remove debris' },
  ],
  AIRBNB: [
    { room: 'Kitchen', detail: 'Reset for next guest: dishes put away, counters, appliance exteriors, restock check' },
    { room: 'Bathrooms', detail: 'Full sanitize, fresh linens/towels staged, restock consumables' },
    { room: 'Bedrooms', detail: 'Fresh linens, beds made to staging standard, surfaces dusted' },
    { room: 'Living Areas', detail: 'Reset staging, vacuum/mop, remote controls & surfaces wiped' },
    { room: 'Guest Turnover Check', detail: 'Walkthrough for damage/missing items, trash out, doors locked' },
  ],
  // Area-by-area, top to bottom, the order dust actually settles in.
  POST_CONSTRUCTION: [
    { room: 'Site safety check', detail: 'Hard hats/boots if trades are on site; power and water on; note anything left by trades before touching it' },
    { room: 'Debris and dust removal', detail: 'Bag construction debris; HEPA-vacuum dust from top down — ledges, frames, outlets, vents' },
    { room: 'Ceilings, vents and fixtures', detail: 'Dust ceiling fans, light fixtures, HVAC returns and registers; wipe smoke-detector covers' },
    { room: 'Windows, frames and tracks', detail: 'Remove stickers and labels, scrape paint/caulk specks with a new blade, clean glass, sills and tracks' },
    { room: 'Cabinets and drawers', detail: 'Vacuum and wipe inside and out; remove protective film; wipe hinges and pulls' },
    { room: 'Kitchen and appliances', detail: 'Remove appliance film and labels; clean inside and out; counters, backsplash, sink and fixtures' },
    { room: 'Bathrooms', detail: 'Remove stickers and grout haze; polish fixtures, mirrors and glass; clean tubs, showers, toilets' },
    { room: 'Walls, doors and trim', detail: 'Dust and spot-clean walls; wipe doors, frames, baseboards and trim; clean switch plates' },
    { room: 'Floors', detail: 'Scrape drywall mud and paint drips; vacuum including edges; damp-mop hard floors with the right cleaner for the finish' },
    { room: 'Final walkthrough', detail: 'Walk every room in daylight with the site contact; photograph each area; list anything for touch-up' },
  ],
  COMMERCIAL: [
    { room: 'Entry and reception', detail: 'Glass doors and partitions, front desk, seating; vacuum or mop; empty bins' },
    { room: 'Offices and workstations', detail: 'Empty trash and recycling; dust clear desk surfaces only (never move papers); vacuum' },
    { room: 'Conference rooms', detail: 'Wipe tables and chairs; clean whiteboards if cleared; reset room; vacuum' },
    { room: 'Restrooms', detail: 'Disinfect toilets, urinals, sinks and partitions; mirrors; restock paper and soap; mop floors' },
    { room: 'Break room and kitchen', detail: 'Counters, sink, microwave inside and out, appliance fronts, tables; empty trash; mop' },
    { room: 'High-touch points', detail: 'Disinfect door handles, push plates, light switches, elevator buttons, railings' },
    { room: 'Floors', detail: 'Vacuum carpets, dust-mop and damp-mop hard floors; spot-clean spills and entry mats' },
    { room: 'Lock-up', detail: 'Lights off as agreed, doors locked, alarm set; note supplies running low for the client' },
  ],
};

/** Adds any missing service lines (and their starting checklists) for one company. Safe to run any number of times. */
export async function ensureServiceLines(tenantId: string, keys: ServiceLineKey[] = SERVICE_DEFS.map((d) => d.key)) {
  const existing = await db.select().from(serviceTypes).where(eq(serviceTypes.tenantId, tenantId));
  const added: ServiceLineKey[] = [];
  for (const def of SERVICE_DEFS.filter((d) => keys.includes(d.key))) {
    if (existing.some((s) => s.key === def.key)) continue;
    const serviceId = crypto.randomUUID();
    await db.insert(serviceTypes).values({ id: serviceId, tenantId, ...def });
    const templateId = crypto.randomUUID();
    await db.insert(checklistTemplates).values({ id: templateId, tenantId, serviceTypeId: serviceId, name: `${def.name} Checklist` });
    const list = CHECKLISTS[def.key];
    for (let i = 0; i < list.length; i += 1) {
      await db.insert(checklistTemplateItems).values({
        id: crypto.randomUUID(),
        templateId,
        roomName: list[i].room,
        taskDetail: list[i].detail,
        sortOrder: i,
        countBy: list[i].room === 'Bedrooms' ? 'BEDROOMS' : list[i].room === 'Bathrooms' ? 'BATHROOMS' : null,
      });
    }
    added.push(def.key);
  }
  return added;
}

/** Every company gets the newer lines once. */
export async function backfillServiceLines() {
  const all = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.isPlatform, false));
  let added = 0;
  for (const t of all) added += (await ensureServiceLines(t.id, ['POST_CONSTRUCTION', 'COMMERCIAL'])).length;
  return { companies: all.length, added };
}
