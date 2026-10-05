import { NextResponse } from 'next/server';
import { sessionUser } from '@/lib/sessionUser';
import { mfaRequired, snoozePrompt } from '@/lib/mfa';

/** "Remind me later" on the optional setup screen — asks again in 30 days. */
export async function POST() {
  const user = await sessionUser();
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  if (await mfaRequired(user)) return NextResponse.json({ error: 'Your role requires two-step sign-in.' }, { status: 403 });
  await snoozePrompt(user.id);
  return NextResponse.json({ ok: true });
}
