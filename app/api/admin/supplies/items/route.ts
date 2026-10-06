import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminSession, forbidden } from '@/lib/adminApi';
import { addItem, addStarterItems, listItems, RestockError, VENDORS } from '@/lib/restock';

export const dynamic = 'force-dynamic';

const vendors = Object.keys(VENDORS) as [keyof typeof VENDORS, ...(keyof typeof VENDORS)[]];
export const itemSchema = z.object({
  name: z.string().min(2).max(120),
  vendor: z.enum(vendors).optional(),
  sku: z.string().max(40).nullable().optional(),
  url: z.string().max(500).nullable().optional(),
  packSize: z.string().max(60).nullable().optional(),
  orderQty: z.number().int().min(1).max(10000).optional(),
  parLevel: z.number().int().min(0).max(10000).optional(),
  onHand: z.number().int().min(0).max(10000).optional(),
});

export async function GET() {
  const admin = await adminSession('supplies.manage');
  if (!admin) return forbidden();
  return NextResponse.json({ items: await listItems(admin.tenantId) });
}

export async function POST(req: Request) {
  const admin = await adminSession('supplies.manage');
  if (!admin) return forbidden();
  const body = await req.json().catch(() => ({}));
  const actor = { id: admin.userId, name: admin.name };
  try {
    if (body?.starter) return NextResponse.json({ added: await addStarterItems(admin.tenantId, actor) });
    const parsed = itemSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the fields and try again.' }, { status: 400 });
    return NextResponse.json({ id: await addItem(admin.tenantId, parsed.data, actor) });
  } catch (err) {
    if (err instanceof RestockError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
