import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requestPasswordReset } from '@/lib/passwordReset';

const schema = z.object({ identifier: z.string().trim().min(3).max(200) });

// "Forgot your username or password?" Always answers the same way, match or
// not, so it can't be used to check whether someone is a client.
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter the email or phone number on your account.' }, { status: 400 });
  }
  try {
    await requestPasswordReset(parsed.data.identifier);
  } catch (err) {
    console.error('[password-reset] failed:', err);
  }
  return NextResponse.json({ ok: true });
}
