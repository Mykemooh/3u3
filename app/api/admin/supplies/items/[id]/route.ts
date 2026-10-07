import { NextResponse } from 'next/server';
import { adminSession, forbidden } from '@/lib/adminApi';
import { archiveItem, updateItem, RestockError } from '@/lib/restock';
import { itemSchema } from '@/lib/restock';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const admin = await adminSession('supplies.manage');
  if (!admin) return forbidden();
  const parsed = itemSchema.partial().safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the fields and try again.' }, { status: 400 });
  try {
    await updateItem(admin.tenantId, params.id, parsed.data, { id: admin.userId, name: admin.name });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof RestockError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const admin = await adminSession('supplies.manage');
  if (!admin) return forbidden();
  try {
    await archiveItem(admin.tenantId, params.id, { id: admin.userId, name: admin.name });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof RestockError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
