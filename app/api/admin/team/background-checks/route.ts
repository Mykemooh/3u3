import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminSession, forbidden } from '@/lib/adminApi';
import { belongsTo, notFound } from '@/lib/tenantGuard';
import { startBackgroundCheck, CheckrError } from '@/lib/checkr';

const schema = z.object({ userId: z.string().min(1), state: z.string().min(2).max(2), city: z.string().max(80).nullable().optional() });

export async function POST(req: Request) {
  const admin = await adminSession();
  if (!admin) return forbidden();
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Pick the person and the state they’ll work in.' }, { status: 400 });
  if (!(await belongsTo(admin.tenantId, 'user', parsed.data.userId))) return notFound();
  try {
    const r = await startBackgroundCheck(admin.tenantId, parsed.data.userId, { state: parsed.data.state, city: parsed.data.city }, { id: admin.userId, name: admin.name });
    return NextResponse.json(r);
  } catch (err) {
    if (err instanceof CheckrError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('[checkr] start failed', err);
    return NextResponse.json({ error: 'Couldn’t reach Checkr. Please try again.' }, { status: 502 });
  }
}
