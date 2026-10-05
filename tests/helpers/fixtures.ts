import { db } from '@/db/client';
import { tenants, users, crews, serviceTypes, addresses, crewMembers } from '@/db/schema';
import { and, eq } from 'drizzle-orm';

/** The seeded 3U3 tenant and its people (db/seed.ts). */
export async function seeded() {
  const tenant = (await db.select().from(tenants).where(eq(tenants.isPlatform, false)).limit(1))[0]!;
  const admin = (await db.select().from(users).where(eq(users.email, 'admin@3u3cleaning.com')).limit(1))[0]!;
  const lead = (await db.select().from(users).where(eq(users.email, 'jordan@3u3cleaning.com')).limit(1))[0]!;
  const client = (await db.select().from(users).where(eq(users.phone, '+12815550199')).limit(1))[0]!;
  const crew = (await db.select().from(crews).where(eq(crews.tenantId, tenant.id)).limit(1))[0]!;
  const standard = (await db.select().from(serviceTypes).where(and(eq(serviceTypes.tenantId, tenant.id), eq(serviceTypes.key, 'STANDARD'))).limit(1))[0]!;
  const address = (await db.select().from(addresses).where(eq(addresses.userId, client.id)).limit(1))[0]!;
  return { tenant, admin, lead, client, crew, standard, address };
}

let n = 0;
export async function makeUser(tenantId: string, role: 'ADMIN' | 'CLEANER' | 'CUSTOMER', extra: Partial<typeof users.$inferInsert> = {}) {
  n += 1;
  const id = crypto.randomUUID();
  await db.insert(users).values({
    id,
    tenantId,
    role,
    name: `Test ${role} ${n}`,
    email: `test-${role.toLowerCase()}-${n}-${id.slice(0, 6)}@example.com`,
    phone: role === 'CUSTOMER' ? `+1281555${String(1000 + n).padStart(4, '0')}${id.slice(0, 1).replace(/\D/, '0')}`.slice(0, 12) : null,
    staffRole: role === 'CLEANER' ? 'CLEANER' : null,
    ...extra,
  });
  return (await db.select().from(users).where(eq(users.id, id)).limit(1))[0]!;
}

export async function addToCrew(crewId: string, userId: string) {
  await db.insert(crewMembers).values({ id: crypto.randomUUID(), crewId, userId });
}

export { db };
