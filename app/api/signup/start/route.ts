import { NextResponse } from 'next/server';
import { z } from 'zod';
import { startSignup, SignupError, hashedIp } from '@/lib/signup';

export async function POST(req: Request) {
  const parsed = z.object({ email: z.string().max(200) }).safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Enter your email.' }, { status: 400 });
  try {
    const r = await startSignup(parsed.data.email, hashedIp(req.headers.get('x-forwarded-for')));
    return NextResponse.json({ ok: true, ...(r.devCode ? { devCode: r.devCode } : {}) });
  } catch (err) {
    if (err instanceof SignupError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}
