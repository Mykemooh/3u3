import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { tenants, serviceTypes, checklistTemplates, checklistTemplateItems, crews, users } from '@/db/schema';

export class ProvisioningError extends Error {}

// The same room-by-room starting checklist every 3U3-pattern company gets
// — sensible, editable defaults grounded in the four standard service
// types (db/seed.ts seeds the exact same content for the original
// tenant; kept here too so a new company provisioned from Admin →
// Platform starts with a genuinely usable, not empty, checklist).
const CHECKLISTS: Record<string, { room: string; detail: string }[]> = {
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
};

const SERVICE_DEFS = [
  { key: 'STANDARD' as const, name: 'Standard Cleaning', defaultDurationMinutes: 150, recurringEligible: true },
  { key: 'DEEP' as const, name: 'Deep Cleaning', defaultDurationMinutes: 240, recurringEligible: false },
  { key: 'MOVE_IN_OUT' as const, name: 'Move-In / Move-Out', defaultDurationMinutes: 240, recurringEligible: false },
  { key: 'AIRBNB' as const, name: 'Airbnb / Rental Turnover', defaultDurationMinutes: 150, recurringEligible: false },
];

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export type ProvisionTenantInput = {
  name: string;
  slug: string;
  tagline?: string;
  primaryColor?: string;
  inkColor?: string;
  bronzeColor?: string;
  creamColor?: string;
  serviceAreaRadiusMiles?: number;
  admin: { name: string; email: string; password: string };
};

/**
 * Everything a brand-new company needs to start operating, provisioned
 * in one shot: the tenant row and its branding, the four standard
 * service types with a working checklist template each, one default
 * crew, and that company's first ADMIN login — the exact same starting
 * stack db/seed.ts has always built for 3U3 itself. The new ADMIN signs
 * in and takes it from here (their own rates, crews, real checklist
 * edits) exactly like 3U3 did.
 */
export async function provisionTenant(input: ProvisionTenantInput): Promise<{ tenantId: string; adminUserId: string }> {
  const slug = slugify(input.slug || input.name);
  if (!slug) throw new ProvisioningError('A usable company slug is required.');

  const existingSlug = (await db.select().from(tenants).where(eq(tenants.slug, slug)).limit(1))[0];
  if (existingSlug) throw new ProvisioningError(`"${slug}" is already taken — choose another.`);

  const existingAdminEmail = (await db.select().from(users).where(eq(users.email, input.admin.email)).limit(1))[0];
  if (existingAdminEmail) throw new ProvisioningError(`${input.admin.email} is already in use by another account.`);

  const tenantId = crypto.randomUUID();
  await db.insert(tenants).values({
    id: tenantId,
    name: input.name,
    slug,
    tagline: input.tagline,
    primaryColor: input.primaryColor || '#2563EB',
    inkColor: input.inkColor || '#0B1F3B',
    bronzeColor: input.bronzeColor || '#1D4ED8',
    creamColor: input.creamColor || '#EFF6FF',
    serviceAreaRadiusMiles: input.serviceAreaRadiusMiles ?? 25,
    // New companies start on a trial, not instantly billed — see
    // lib/platform.ts for how long and what happens when it lapses.
    planStatus: 'TRIALING',
    accessExpiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
  });

  for (const def of SERVICE_DEFS) {
    const serviceId = crypto.randomUUID();
    await db.insert(serviceTypes).values({ id: serviceId, tenantId, ...def });

    const templateId = crypto.randomUUID();
    await db.insert(checklistTemplates).values({ id: templateId, tenantId, serviceTypeId: serviceId, name: `${def.name} Checklist` });
    const checklist = CHECKLISTS[def.key];
    for (let i = 0; i < checklist.length; i += 1) {
      await db.insert(checklistTemplateItems).values({
        id: crypto.randomUUID(),
        templateId,
        roomName: checklist[i].room,
        taskDetail: checklist[i].detail,
        sortOrder: i,
        countBy: checklist[i].room === 'Bedrooms' ? 'BEDROOMS' : checklist[i].room === 'Bathrooms' ? 'BATHROOMS' : null,
      });
    }
  }

  await db.insert(crews).values({
    id: crypto.randomUUID(),
    tenantId,
    name: 'Crew 1',
    workStartMinutes: 8 * 60,
    workEndMinutes: 17 * 60,
    homesPerDay: 3,
    commuteBufferMinutes: 45,
  });

  const adminUserId = crypto.randomUUID();
  await db.insert(users).values({
    id: adminUserId,
    tenantId,
    role: 'ADMIN',
    name: input.admin.name,
    email: input.admin.email,
    passwordHash: bcrypt.hashSync(input.admin.password, 10),
  });

  return { tenantId, adminUserId };
}
