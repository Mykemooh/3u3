import { NextResponse } from 'next/server';
import { adminSession, forbidden } from '@/lib/adminApi';
import { kbSchema, saveArticle, deleteArticle, KbError } from '@/lib/help';

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const admin = await adminSession('help.manage');
  if (!admin) return forbidden();
  const parsed = kbSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Add a title and the article text.' }, { status: 400 });
  try {
    await saveArticle(admin.tenantId, parsed.data, { id: admin.userId, name: admin.name }, params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof KbError) return NextResponse.json({ error: err.message }, { status: 404 });
    throw err;
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const admin = await adminSession('help.manage');
  if (!admin) return forbidden();
  try {
    await deleteArticle(admin.tenantId, params.id, { id: admin.userId, name: admin.name });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof KbError) return NextResponse.json({ error: err.message }, { status: 404 });
    throw err;
  }
}
