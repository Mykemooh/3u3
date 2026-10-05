import { NextResponse } from 'next/server';
import { sessionUser } from '@/lib/sessionUser';
import { disableMfa } from '@/lib/mfa';
import { mfaApiError } from '@/lib/api';

export async function POST(req: Request) {
  const user = await sessionUser();
  if (!user || user.mfaPending) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  try {
    await disableMfa(user.id, String(body.code ?? ''));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return mfaApiError(err);
  }
}
