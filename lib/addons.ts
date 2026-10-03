import { db } from '@/db/client';
import { addOnServices, clientAddOnRates, bookingAddOns } from '@/db/schema';
import { and, eq, inArray } from 'drizzle-orm';

export class AddOnError extends Error {}

/**
 * Add-on services — "Want to add a service for this clean?" on the
 * booking wizard. A tenant-wide catalog the admin manages (name,
 * description, default price, active/inactive, display order), with an
 * optional per-client override price set during quote/client profile
 * setup, mirroring how clientRates overrides a service's base price.
 */

export type AddOnServiceRow = typeof addOnServices.$inferSelect;

export async function getAddOnCatalog(tenantId: string): Promise<AddOnServiceRow[]> {
  return (await db.select().from(addOnServices).where(eq(addOnServices.tenantId, tenantId))).sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
  );
}

export async function createAddOnService(input: {
  tenantId: string;
  name: string;
  description?: string | null;
  defaultPriceCents: number;
  sortOrder?: number;
}): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(addOnServices).values({
    id,
    tenantId: input.tenantId,
    name: input.name,
    description: input.description ?? null,
    defaultPriceCents: input.defaultPriceCents,
    sortOrder: input.sortOrder ?? 0,
  });
  return id;
}

export async function updateAddOnService(
  id: string,
  patch: Partial<{ name: string; description: string | null; defaultPriceCents: number; active: boolean; sortOrder: number }>,
): Promise<void> {
  await db.update(addOnServices).set(patch).where(eq(addOnServices.id, id));
}

/** Per-client price overrides on file, keyed by add-on service id. */
export async function getClientAddOnRates(userId: string): Promise<Map<string, number>> {
  const rows = await db.select().from(clientAddOnRates).where(eq(clientAddOnRates.userId, userId));
  return new Map(rows.map((r) => [r.addOnServiceId, r.priceCents]));
}

export async function setClientAddOnRate(userId: string, addOnServiceId: string, priceCents: number): Promise<void> {
  const existing = (
    await db
      .select()
      .from(clientAddOnRates)
      .where(and(eq(clientAddOnRates.userId, userId), eq(clientAddOnRates.addOnServiceId, addOnServiceId)))
      .limit(1)
  )[0];
  if (existing) {
    await db.update(clientAddOnRates).set({ priceCents }).where(eq(clientAddOnRates.id, existing.id));
  } else {
    await db.insert(clientAddOnRates).values({ id: crypto.randomUUID(), userId, addOnServiceId, priceCents });
  }
}

export async function clearClientAddOnRate(userId: string, addOnServiceId: string): Promise<void> {
  await db.delete(clientAddOnRates).where(and(eq(clientAddOnRates.userId, userId), eq(clientAddOnRates.addOnServiceId, addOnServiceId)));
}

export type ClientAddOn = { id: string; name: string; description: string | null; priceCents: number };

/** Every active add-on for this tenant, priced at this client's override (falling back to the default). What the booking wizard shows. */
export async function getAddOnsForClient(tenantId: string, userId: string): Promise<ClientAddOn[]> {
  const catalog = (await getAddOnCatalog(tenantId)).filter((a) => a.active);
  if (catalog.length === 0) return [];
  const overrides = await getClientAddOnRates(userId);
  return catalog.map((a) => ({ id: a.id, name: a.name, description: a.description, priceCents: overrides.get(a.id) ?? a.defaultPriceCents }));
}

export async function getBookingAddOns(bookingId: string) {
  return db.select().from(bookingAddOns).where(eq(bookingAddOns.bookingId, bookingId));
}

export async function getBookingAddOnsFor(bookingIds: string[]) {
  if (bookingIds.length === 0) return [];
  return db.select().from(bookingAddOns).where(inArray(bookingAddOns.bookingId, bookingIds));
}
