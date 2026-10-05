import { NextResponse } from 'next/server';
import { z } from 'zod';
import { superAdminId } from '@/lib/adminApi';
import { setSignupOpen } from '@/lib/signup';

export async function PATCH(req: Request) {
  if (!(await superAdminId())) return NextResponse.json({ error: 'Platform owner only' }, { status: 403 });
  const parsed = z.object({ open: z.boolean() }).safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });
  await setSignupOpen(parsed.data.open);
  return NextResponse.json({ ok: true, open: parsed.data.open });
}
