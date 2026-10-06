import { NextResponse } from 'next/server';
import { staffUser } from '@/lib/staffSession';
import { disconnectCalendar } from '@/lib/googleCalendar';

export async function POST() {
  const user = await staffUser();
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 403 });
  await disconnectCalendar({ id: user.id, tenantId: user.tenantId, name: user.name });
  return NextResponse.json({ ok: true });
}
