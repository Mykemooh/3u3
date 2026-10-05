import { NextResponse } from 'next/server';
import { sessionUser } from '@/lib/sessionUser';
import { sendEmailCode } from '@/lib/mfa';
import { mfaApiError } from '@/lib/api';

/** Emails a one-time sign-in code — the fallback when the phone app isn't handy. */
export async function POST() {
  const user = await sessionUser();
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  try {
    return NextResponse.json(await sendEmailCode(user.id));
  } catch (err) {
    return mfaApiError(err);
  }
}
