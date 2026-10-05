import { NextResponse } from 'next/server';
import { adminSession, forbidden } from '@/lib/adminApi';
import { kbSchema, saveArticle } from '@/lib/help';

export async function POST(req: Request) {
  const admin = await adminSession('help.manage');
  if (!admin) return forbidden();
  const parsed = kbSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Add a title and the article text.' }, { status: 400 });
  return NextResponse.json({ id: await saveArticle(admin.tenantId, parsed.data, { id: admin.userId, name: admin.name }) });
}
