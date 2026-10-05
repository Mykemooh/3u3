import { NextResponse } from 'next/server';
import { sessionUser } from '@/lib/sessionUser';
import { beginSetup } from '@/lib/mfa';
import { mfaApiError } from '@/lib/api';

/** Starts linking an authenticator app: a new secret and its QR code. */
export async function POST() {
  const user = await sessionUser();
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  if (user.mfaPending) return NextResponse.json({ error: 'Finish signing in first.' }, { status: 401 });
  try {
    return NextResponse.json(await beginSetup(user.id));
  } catch (err) {
    return mfaApiError(err);
  }
}
