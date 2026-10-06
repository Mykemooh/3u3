import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminSession, forbidden } from '@/lib/adminApi';
import { chooseMeta, disconnectMeta, metaChoices, MetaError } from '@/lib/meta';

export const dynamic = 'force-dynamic';

export async function GET() {
  const admin = await adminSession('marketing.manage');
  if (!admin) return forbidden();
  try {
    return NextResponse.json(await metaChoices(admin.tenantId));
  } catch (err) {
    if (err instanceof MetaError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}

const schema = z.object({ adAccountId: z.string().min(3).max(60), pageId: z.string().min(3).max(60) });

export async function PUT(req: Request) {
  const admin = await adminSession('marketing.manage');
  if (!admin) return forbidden();
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Pick an ad account and a page.' }, { status: 400 });
  try {
    await chooseMeta(admin.tenantId, parsed.data.adAccountId, parsed.data.pageId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof MetaError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}

export async function DELETE() {
  const admin = await adminSession('marketing.manage');
  if (!admin) return forbidden();
  await disconnectMeta(admin.tenantId, { id: admin.userId, name: admin.name });
  return NextResponse.json({ ok: true });
}
