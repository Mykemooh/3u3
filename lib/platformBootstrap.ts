import bcrypt from 'bcryptjs';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { tenants, users } from '@/db/schema';

export type BootstrapResult =
  | { status: 'created'; email: string }
  | { status: 'exists' }
  | { status: 'skipped'; reason: string };

/**
 * Makes sure the platform has an owner login (SUPER_ADMIN) — the one
 * account that can open /platform, turn self-serve signups on, and create
 * companies by hand.
 *
 * Runs on every deploy (scripts/backfill-on-build.ts) when
 * PLATFORM_ADMIN_EMAIL and PLATFORM_ADMIN_PASSWORD are set in the
 * hosting environment, so no one needs database access to get the first
 * login. It only ever creates: once any SUPER_ADMIN exists it does
 * nothing, so the env vars can stay set (or be removed) safely, and a
 * password changed in the app is never overwritten. The password is never
 * logged.
 */
export async function ensurePlatformOwner(input: { email?: string; password?: string; name?: string }): Promise<BootstrapResult> {
  const email = input.email?.trim().toLowerCase();
  const password = input.password ?? '';
  if (!email || !password) return { status: 'skipped', reason: 'PLATFORM_ADMIN_EMAIL / PLATFORM_ADMIN_PASSWORD not set' };

  const existingOwner = (await db.select({ id: users.id }).from(users).where(eq(users.role, 'SUPER_ADMIN')).limit(1))[0];
  if (existingOwner) return { status: 'exists' };

  if (password.length < 10) return { status: 'skipped', reason: 'PLATFORM_ADMIN_PASSWORD must be at least 10 characters' };
  const emailTaken = (await db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${email}`).limit(1))[0];
  if (emailTaken) return { status: 'skipped', reason: `${email} already belongs to another account — use a different email for the platform owner` };

  let platform = (await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.isPlatform, true)).limit(1))[0];
  if (!platform) {
    const slugTaken = (await db.select({ id: tenants.id }).from(tenants).where(and(eq(tenants.slug, 'platform'))).limit(1))[0];
    const id = crypto.randomUUID();
    await db.insert(tenants).values({
      id,
      name: 'Platform',
      slug: slugTaken ? `platform-${id.slice(0, 6)}` : 'platform',
      isPlatform: true,
      planStatus: 'ACTIVE',
    });
    platform = { id };
  }

  await db.insert(users).values({
    id: crypto.randomUUID(),
    tenantId: platform.id,
    role: 'SUPER_ADMIN',
    name: input.name?.trim() || 'Platform Owner',
    email,
    passwordHash: bcrypt.hashSync(password, 10),
  });
  return { status: 'created', email };
}
