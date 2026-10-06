import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { tenants, crews, users } from '@/db/schema';
import { ensureServiceLines } from '@/lib/serviceLines';

export class ProvisioningError extends Error {}

// Service lines and their starting checklists live in lib/serviceLines.ts,
// shared with db/seed.ts and the deploy-time backfill.

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
 * in one shot: the tenant row and its branding, every standard service
 * line with a working checklist template each, one default
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
    // Every company starts on the Free plan (lib/billing/plans.ts): no
    // trial clock, no lock-out — a platform fee on card payments instead.
    planStatus: 'ACTIVE',
    accessExpiresAt: null,
    plan: 'FREE',
  });

  await ensureServiceLines(tenantId);

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
