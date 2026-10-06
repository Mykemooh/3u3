import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seeded, db } from './helpers/fixtures';
import { addItem, addStarterItems, listItems, markOrdered, reportMatches, restockList, updateItem, RestockError } from '@/lib/restock';
import { createSupplyReport } from '@/lib/supplies';
import { supplyItems, supplyReports } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { runTool, type TexContext } from '@/lib/texTools';

test('restock list: par level and crew reports, grouped by store with working links', async () => {
  const { tenant, crew, lead } = await seeded();
  await db.delete(supplyItems).where(eq(supplyItems.tenantId, tenant.id));
  const a = await addItem(tenant.id, { name: 'Glass cleaner', vendor: 'AMAZON', sku: 'b07abc1234', orderQty: 2, parLevel: 4, onHand: 1 });
  await addItem(tenant.id, { name: 'Microfiber cloths', vendor: 'AMAZON', sku: 'B08XYZ9876', orderQty: 1, parLevel: 10, onHand: 30 });
  const c = await addItem(tenant.id, { name: 'Mop heads', vendor: 'COSTCO', orderQty: 1, parLevel: 2, onHand: 5 });
  await assert.rejects(() => addItem(tenant.id, { name: 'x' }), RestockError);
  await assert.rejects(() => addItem(tenant.id, { name: 'Bad link', url: 'http://insecure' }), /https/);

  let list = await restockList(tenant.id);
  assert.deepEqual(list.groups.map((g) => g.vendor), ['AMAZON'], 'only the low item is listed');
  assert.equal(list.groups[0].lines[0].item.id, a);
  assert.match(list.groups[0].cartUrl!, /ASIN\.1=B07ABC1234&Quantity\.1=2$/);
  assert.match(list.groups[0].lines[0].link, /amazon\.com\/dp\/B07ABC1234/);

  // A crew flags mop heads; it joins the list under Costco with a search link.
  await createSupplyReport({ tenantId: tenant.id, crewId: crew.id, reportedByUserId: lead.id, productName: 'mop heads (the blue ones)', status: 'OUT' });
  list = await restockList(tenant.id);
  const costco = list.groups.find((g) => g.vendor === 'COSTCO')!;
  assert.ok(costco && costco.lines[0].item.id === c && /costco\.com\/CatalogSearch/.test(costco.lines[0].link));

  // Something flagged that isn't in the catalog is surfaced, not lost.
  await createSupplyReport({ tenantId: tenant.id, crewId: crew.id, reportedByUserId: lead.id, productName: 'Descaler for the shower heads', status: 'LOW' });
  assert.ok((await restockList(tenant.id)).unmatched.some((u) => /descaler/i.test(u.productName)));

  // Ordering updates counts and resolves the matching reports.
  await markOrdered(tenant.id, [a, c]);
  const after = (await listItems(tenant.id)).find((i) => i.id === a)!;
  assert.equal(after.onHand, 3);
  list = await restockList(tenant.id);
  assert.ok(!list.groups.some((g) => g.vendor === 'COSTCO'));
  const open = await db.select().from(supplyReports).where(and(eq(supplyReports.tenantId, tenant.id), eq(supplyReports.resolved, false)));
  assert.ok(open.every((r) => !/mop/i.test(r.productName)));
  await updateItem(tenant.id, a, { onHand: 0 });
  assert.ok((await restockList(tenant.id)).groups.length >= 1);
});

test('starter list is added once; matching is forgiving but not sloppy', async () => {
  const { tenant } = await seeded();
  await db.delete(supplyItems).where(eq(supplyItems.tenantId, tenant.id));
  assert.ok((await addStarterItems(tenant.id)) >= 8);
  assert.equal(await addStarterItems(tenant.id), 0);
  assert.equal(reportMatches('Toilet cleaner', 'Toilet bowl cleaner'), true);
  assert.equal(reportMatches('trash bags', 'Trash bags 13 gallon'), true);
  assert.equal(reportMatches('vacuum', 'Mop heads'), false);
});

test('Tex shows the restock list to office staff only', async () => {
  const { tenant, admin, client } = await seeded();
  const base = { tenant, channel: 'WEB' as const, phone: null, conversationId: `web:test:${crypto.randomUUID()}`, verified: true, hasPin: false, open: true, handoff: false, transfer: false, articlesSeen: [] };
  const r = (await runTool({ ...base, audience: 'ADMIN', userId: admin.id, userName: admin.name } as TexContext, 'restock_list', {})) as { stores?: unknown[] };
  assert.ok(Array.isArray(r.stores));
  const denied = (await runTool({ ...base, audience: 'CLIENT', userId: client.id, userName: client.name } as TexContext, 'restock_list', {})) as { error?: string };
  assert.match(String(denied.error), /No tool/);
});
