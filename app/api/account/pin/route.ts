import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { setPin, clearPin, hasPin, PinError } from '@/lib/phonePin';

export const dynamic = 'force-dynamic';

async function me() {
  const user = (await getServerSession(authOptions).catch(() => null))?.user as { id?: string; role?: string; mfaPending?: boolean } | undefined;
  return user?.id && !user.mfaPending && user.role === 'CUSTOMER' ? user.id : null;
}

/** The client's phone PIN: whether one is set (never the PIN itself). */
export async function GET() {
  const id = await me();
  if (!id) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  return NextResponse.json({ set: await hasPin(id) });
}

const schema = z.object({ pin: z.string().regex(/^\d{4}$/, 'A PIN is exactly 4 digits.') });

export async function PUT(req: Request) {
  const id = await me();
  if (!id) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'A PIN is exactly 4 digits.' }, { status: 400 });
  try {
    await setPin(id, parsed.data.pin);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof PinError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}

export async function DELETE() {
  const id = await me();
  if (!id) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  await clearPin(id);
  return NextResponse.json({ ok: true });
}
