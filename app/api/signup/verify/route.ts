import { NextResponse } from 'next/server';
import { z } from 'zod';
import { verifySignupCode, SignupError } from '@/lib/signup';

export async function POST(req: Request) {
  const parsed = z.object({ email: z.string().max(200), code: z.string().max(12) }).safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Enter the code from the email.' }, { status: 400 });
  try {
    await verifySignupCode(parsed.data.email, parsed.data.code);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof SignupError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}
