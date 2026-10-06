import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminSession, forbidden } from '@/lib/adminApi';
import { emailRestockList, markOrdered, restockList, RestockError } from '@/lib/restock';

export const dynamic = 'force-dynamic';

export async function GET() {
  const admin = await adminSession('supplies.manage');
  if (!admin) return forbidden();
  const { groups, unmatched } = await restockList(admin.tenantId);
  return NextResponse.json({
    groups: groups.map((g) => ({ vendor: g.vendor, label: g.label, cartUrl: g.cartUrl, lines: g.lines.map((l) => ({ id: l.item.id, name: l.item.name, qty: l.qty, packSize: l.item.packSize, why: l.why, link: l.link })) })),
    unmatched,
  });
}

const schema = z.object({ action: z.enum(['ordered', 'email']), itemIds: z.array(z.string()).max(200).optional() });

export async function POST(req: Request) {
  const admin = await adminSession('supplies.manage');
  if (!admin) return forbidden();
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Pick what to do.' }, { status: 400 });
  try {
    if (parsed.data.action === 'email') return NextResponse.json({ sent: await emailRestockList(admin.tenantId) });
    return NextResponse.json({ marked: await markOrdered(admin.tenantId, parsed.data.itemIds ?? [], { id: admin.userId, name: admin.name }) });
  } catch (err) {
    if (err instanceof RestockError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
