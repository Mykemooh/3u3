import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminSession, forbidden } from '@/lib/adminApi';
import { markHandled, TexError } from '@/lib/tex';

/** Marks a Tex conversation that was handed off as dealt with. */
export async function POST(req: Request) {
  const admin = await adminSession('messages.manage');
  if (!admin) return forbidden();
  const parsed = z.object({ conversationId: z.string().min(3).max(200) }).safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });
  try {
    await markHandled(admin.tenantId, parsed.data.conversationId, { id: admin.userId, name: admin.name });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof TexError) return NextResponse.json({ error: err.message }, { status: 404 });
    throw err;
  }
}
