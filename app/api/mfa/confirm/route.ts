import { NextResponse } from 'next/server';
import { sessionUser } from '@/lib/sessionUser';
import { confirmSetup } from '@/lib/mfa';
import { mfaApiError } from '@/lib/api';

/** Confirms the authenticator with one code; returns the ten backup codes, once. */
export async function POST(req: Request) {
  const user = await sessionUser();
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  if (user.mfaPending) return NextResponse.json({ error: 'Finish signing in first.' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  try {
    return NextResponse.json(await confirmSetup(user.id, String(body.code ?? '')));
  } catch (err) {
    return mfaApiError(err);
  }
}
