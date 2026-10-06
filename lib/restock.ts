import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { supplyItems, supplyReports } from '@/db/schema';
import { logChange, type Actor } from '@/lib/audit';
import { getOwnerEmail } from '@/lib/data';
import { sendEmail, esc } from '@/lib/email';
import { appUrl } from '@/lib/url';

/**
 * Restocking supplies, with no vendor account or API needed.
 *
 * The owner lists the products they reorder (where they buy each, how many
 * to keep, how many to order). The restock list is anything under its
 * par level plus anything a crew has flagged as low or out. Each vendor
 * group gets a link that works from any browser: Amazon's add-to-cart link
 * fills the cart for every item that has an ASIN; other vendors get the
 * product page (or a search for the name) — plus a Google Shopping link to
 * compare prices. The owner checks out themselves; nothing is bought here.
 */

export class RestockError extends Error {
  status = 400;
}

export const VENDORS = {
  AMAZON: { label: 'Amazon', search: (q: string) => `https://www.amazon.com/s?k=${encodeURIComponent(q)}` },
  WALMART: { label: 'Walmart', search: (q: string) => `https://www.walmart.com/search?q=${encodeURIComponent(q)}` },
  SAMS: { label: 'Sam’s Club', search: (q: string) => `https://www.samsclub.com/s/${encodeURIComponent(q)}` },
  COSTCO: { label: 'Costco', search: (q: string) => `https://www.costco.com/CatalogSearch?keyword=${encodeURIComponent(q)}` },
  HOME_DEPOT: { label: 'Home Depot', search: (q: string) => `https://www.homedepot.com/s/${encodeURIComponent(q)}` },
  GRAINGER: { label: 'Grainger', search: (q: string) => `https://www.grainger.com/search?searchQuery=${encodeURIComponent(q)}` },
  OTHER: { label: 'Other', search: (q: string) => `https://www.google.com/search?q=${encodeURIComponent(q)}` },
} as const;
export type Vendor = keyof typeof VENDORS;

export const compareUrl = (name: string) => `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(name)}`;
const ASIN = /^[A-Z0-9]{10}$/;

export const STARTER_ITEMS: { name: string; packSize: string; orderQty: number; parLevel: number }[] = [
  { name: 'All-purpose cleaner spray', packSize: 'case of 6', orderQty: 1, parLevel: 4 },
  { name: 'Glass cleaner', packSize: 'case of 6', orderQty: 1, parLevel: 4 },
  { name: 'Toilet bowl cleaner', packSize: 'pack of 12', orderQty: 1, parLevel: 4 },
  { name: 'Bathroom tub and tile cleaner', packSize: 'case of 6', orderQty: 1, parLevel: 3 },
  { name: 'Microfiber cleaning cloths', packSize: 'pack of 24', orderQty: 2, parLevel: 20 },
  { name: 'Disposable gloves', packSize: 'box of 100', orderQty: 2, parLevel: 2 },
  { name: 'Trash bags 13 gallon', packSize: 'box of 150', orderQty: 1, parLevel: 1 },
  { name: 'Mop heads', packSize: 'pack of 4', orderQty: 1, parLevel: 4 },
  { name: 'Scrub sponges', packSize: 'pack of 12', orderQty: 1, parLevel: 6 },
  { name: 'Vacuum bags or filters', packSize: 'pack of 6', orderQty: 1, parLevel: 3 },
];

const clean = (s: unknown, max: number) => (typeof s === 'string' ? s.trim().slice(0, max) : '');

export type ItemInput = { name: string; vendor?: Vendor; sku?: string | null; url?: string | null; packSize?: string | null; orderQty?: number; parLevel?: number; onHand?: number };

function normalize(d: Partial<ItemInput>) {
  const out: Partial<typeof supplyItems.$inferInsert> = {};
  if (d.name !== undefined) {
    out.name = clean(d.name, 120);
    if (out.name.length < 2) throw new RestockError('Give the product a name.');
  }
  if (d.vendor !== undefined) {
    if (!(d.vendor in VENDORS)) throw new RestockError('Pick where you buy it.');
    out.vendor = d.vendor;
  }
  if (d.sku !== undefined) {
    const sku = clean(d.sku, 40).toUpperCase();
    out.sku = sku || null;
  }
  if (d.url !== undefined) {
    const url = clean(d.url, 500);
    if (url && !/^https:\/\/[^\s]+$/i.test(url)) throw new RestockError('Product links must start with https://');
    out.url = url || null;
  }
  if (d.packSize !== undefined) out.packSize = clean(d.packSize, 60) || null;
  for (const k of ['orderQty', 'parLevel', 'onHand'] as const) {
    if (d[k] !== undefined) {
      const n = Math.round(Number(d[k]));
      if (!Number.isFinite(n) || n < 0 || n > 10000) throw new RestockError('Quantities are whole numbers from 0 up.');
      out[k] = n;
    }
  }
  if (out.orderQty === 0) throw new RestockError('Order at least 1.');
  return out;
}

export async function listItems(tenantId: string) {
  return db.select().from(supplyItems).where(and(eq(supplyItems.tenantId, tenantId), eq(supplyItems.archived, false))).orderBy(asc(supplyItems.name));
}

export async function addItem(tenantId: string, d: ItemInput, actor?: Actor) {
  const v = normalize({ vendor: 'AMAZON', ...d });
  const id = crypto.randomUUID();
  await db.insert(supplyItems).values({ id, tenantId, ...(v as { name: string }) });
  await logChange({ tenantId, actor, entityType: 'supply_item', entityId: id, action: 'created', summary: `Added supply “${v.name}”` });
  return id;
}

export async function updateItem(tenantId: string, id: string, d: Partial<ItemInput>, actor?: Actor) {
  const row = (await db.select().from(supplyItems).where(and(eq(supplyItems.id, id), eq(supplyItems.tenantId, tenantId))).limit(1))[0];
  if (!row) throw new RestockError('That supply wasn’t found.');
  await db.update(supplyItems).set(normalize(d)).where(eq(supplyItems.id, id));
  await logChange({ tenantId, actor, entityType: 'supply_item', entityId: id, action: 'updated', summary: `Updated supply “${row.name}”` });
}

export async function archiveItem(tenantId: string, id: string, actor?: Actor) {
  const row = (await db.select().from(supplyItems).where(and(eq(supplyItems.id, id), eq(supplyItems.tenantId, tenantId))).limit(1))[0];
  if (!row) throw new RestockError('That supply wasn’t found.');
  await db.update(supplyItems).set({ archived: true }).where(eq(supplyItems.id, id));
  await logChange({ tenantId, actor, entityType: 'supply_item', entityId: id, action: 'deleted', summary: `Removed supply “${row.name}”` });
}

export async function addStarterItems(tenantId: string, actor?: Actor) {
  const have = new Set((await listItems(tenantId)).map((i) => i.name.toLowerCase()));
  let n = 0;
  for (const s of STARTER_ITEMS) {
    if (have.has(s.name.toLowerCase())) continue;
    await addItem(tenantId, { ...s, vendor: 'AMAZON', onHand: s.parLevel }, actor);
    n++;
  }
  return n;
}

const GENERIC = new Set(['cleaner', 'cleaners', 'cleaning', 'spray', 'heads', 'bags', 'wipes', 'pack', 'refill', 'bottle', 'bottles', 'large', 'small', 'white', 'with', 'from', 'that', 'this', 'the']);
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length > 2);
/** Does a crew's free-text "product" report refer to this catalog item? (One name contains the other, or they share a distinctive word of 5+ letters — not generic ones like “cleaner” or “heads”.) */
export function reportMatches(report: string, item: string) {
  const a = report.toLowerCase();
  const b = item.toLowerCase();
  if (a.includes(b) || b.includes(a)) return true;
  const keep = (w: string) => w.length >= 5 && !GENERIC.has(w);
  const wa = words(a).filter(keep);
  const wb = new Set(words(b).filter(keep));
  return wa.some((w) => wb.has(w));
}

export type RestockLine = { item: typeof supplyItems.$inferSelect; qty: number; why: string; link: string };
export type RestockGroup = { vendor: Vendor; label: string; lines: RestockLine[]; cartUrl: string | null };

const lineLink = (i: typeof supplyItems.$inferSelect) => i.url || (i.vendor === 'AMAZON' && i.sku && ASIN.test(i.sku) ? `https://www.amazon.com/dp/${i.sku}` : VENDORS[i.vendor].search(i.name));

/** What to buy now: items under their par level, items crews flagged, grouped by vendor with a cart or search link each. */
export async function restockList(tenantId: string) {
  const items = await listItems(tenantId);
  const reports = await db.select().from(supplyReports).where(and(eq(supplyReports.tenantId, tenantId), eq(supplyReports.resolved, false)));
  const lines: RestockLine[] = [];
  for (const item of items) {
    const flagged = reports.filter((r) => reportMatches(r.productName, item.name));
    const low = item.parLevel > 0 && item.onHand < item.parLevel;
    if (!low && !flagged.length) continue;
    const why = [low ? `${item.onHand} on hand (keep ${item.parLevel})` : '', flagged.length ? `${flagged.length === 1 ? 'a crew flagged it' : `${flagged.length} crew reports`} (${flagged[0].status.toLowerCase()})` : ''].filter(Boolean).join(' · ');
    lines.push({ item, qty: item.orderQty, why, link: lineLink(item) });
  }
  const unmatched = reports.filter((r) => !items.some((i) => reportMatches(r.productName, i.name)));
  const groups: RestockGroup[] = [];
  for (const line of lines) {
    let g = groups.find((x) => x.vendor === line.item.vendor);
    if (!g) groups.push((g = { vendor: line.item.vendor, label: VENDORS[line.item.vendor].label, lines: [], cartUrl: null }));
    g.lines.push(line);
  }
  for (const g of groups) {
    if (g.vendor !== 'AMAZON') continue;
    const asins = g.lines.filter((l) => l.item.sku && ASIN.test(l.item.sku));
    if (asins.length) g.cartUrl = `https://www.amazon.com/gp/aws/cart/add.html?${asins.map((l, n) => `ASIN.${n + 1}=${l.item.sku}&Quantity.${n + 1}=${l.qty}`).join('&')}`;
  }
  return { groups, unmatched: unmatched.map((r) => ({ id: r.id, productName: r.productName, status: r.status, notes: r.notes })), compareUrl };
}

/** The owner bought these: on-hand goes up by the order quantity and matching crew reports are resolved. */
export async function markOrdered(tenantId: string, itemIds: string[], actor?: Actor) {
  const items = itemIds.length ? await db.select().from(supplyItems).where(and(eq(supplyItems.tenantId, tenantId), inArray(supplyItems.id, itemIds))) : [];
  if (!items.length) throw new RestockError('Pick at least one item.');
  const reports = await db.select().from(supplyReports).where(and(eq(supplyReports.tenantId, tenantId), eq(supplyReports.resolved, false)));
  for (const item of items) {
    await db.update(supplyItems).set({ onHand: item.onHand + item.orderQty, lastOrderedAt: new Date() }).where(eq(supplyItems.id, item.id));
    for (const r of reports.filter((x) => reportMatches(x.productName, item.name))) {
      await db.update(supplyReports).set({ resolved: true, resolvedAt: new Date() }).where(eq(supplyReports.id, r.id));
    }
  }
  await logChange({ tenantId, actor, entityType: 'supply_item', entityId: items[0].id, action: 'updated', summary: `Marked ${items.length} supply item${items.length === 1 ? '' : 's'} as ordered` });
  return items.length;
}

/** Emails the owner the shopping list, grouped by store, with links. */
export async function emailRestockList(tenantId: string) {
  const list = await restockList(tenantId);
  if (!list.groups.length) throw new RestockError('Nothing needs restocking right now.');
  const to = await getOwnerEmail(tenantId);
  if (!to) throw new RestockError('There’s no owner email on file to send it to.');
  const html = `<h2>Supplies to restock</h2>${list.groups
    .map((g) => `<h3>${esc(g.label)}</h3>${g.cartUrl ? `<p><a href="${esc(g.cartUrl)}">Open Amazon cart with these items</a></p>` : ''}<ul>${g.lines.map((l) => `<li>${esc(l.item.name)} × ${l.qty}${l.item.packSize ? ` (${esc(l.item.packSize)})` : ''} — ${esc(l.why)} · <a href="${esc(l.link)}">link</a> · <a href="${esc(compareUrl(l.item.name))}">compare prices</a></li>`).join('')}</ul>`)
    .join('')}<p><a href="${esc(appUrl('/admin/supplies'))}">Open Supplies</a></p>`;
  return sendEmail({ to, subject: `Supplies to restock (${list.groups.reduce((n, g) => n + g.lines.length, 0)} items)`, html });
}
