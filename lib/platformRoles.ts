import { db } from '@/db/client';
import { tenants } from '@/db/schema';
import { eq } from 'drizzle-orm';

/** The platform tenant, whose roles are the template every new company copies (lib/roles.ts). */
export async function platformTenantId() {
  return (await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.isPlatform, true)).limit(1))[0]?.id ?? null;
}
