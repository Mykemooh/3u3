import { NextResponse } from 'next/server';
import { adminSession, forbidden } from '@/lib/adminApi';
import { addItem, addStarterItems, listItems, RestockError, itemSchema } from '@/lib/restock';

export const dynamic = 'force-dynamic';

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
