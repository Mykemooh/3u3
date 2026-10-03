/**
 * One-time: creates the platform's own pseudo-tenant (isPlatform=true,
 * never a real cleaning business, never billed, never access-gated) and
 * its first SUPER_ADMIN login — the platform owner who can then create
 * every other company from Admin → Platform in the browser. Safe to
 * re-run: does nothing if a platform tenant already exists.
 *
 * Run with: npx tsx --env-file=.env.local scripts/bootstrap-platform.ts
 * Reads PLATFORM_ADMIN_EMAIL / PLATFORM_ADMIN_PASSWORD from the
 * environment, or falls back to a generated password printed below —
 * change it on first login either way.
 */
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db, pool } from '../db/client';
import { tenants, users } from '../db/schema';

async function main() {
  const existing = (await db.select().from(tenants).where(eq(tenants.isPlatform, true)).limit(1))[0];
  if (existing) {
    console.log('Platform tenant already exists:', existing.id);
    return;
  }

  const tenantId = crypto.randomUUID();
  await db.insert(tenants).values({
    id: tenantId,
    name: 'Platform',
    slug: 'platform',
    isPlatform: true,
    planStatus: 'ACTIVE',
  });

  const email = process.env.PLATFORM_ADMIN_EMAIL || 'owner@platform.local';
  const password = process.env.PLATFORM_ADMIN_PASSWORD || crypto.randomUUID().slice(0, 12);
  await db.insert(users).values({
    id: crypto.randomUUID(),
    tenantId,
    role: 'SUPER_ADMIN',
    name: 'Platform Owner',
    email,
    passwordHash: bcrypt.hashSync(password, 10),
  });

  console.log('---------------------------------------------');
  console.log('Platform bootstrapped.');
  console.log(`SUPER_ADMIN login: ${email} / ${password}`);
  console.log('Sign in and change this password — there is no reset flow for this role yet.');
  console.log('---------------------------------------------');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
