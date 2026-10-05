import { NextResponse } from 'next/server';
import { joinWaitlist, waitlistSchema, SignupError, hashedIp } from '@/lib/signup';

export async function POST(req: Request) {
  const parsed = waitlistSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Add your name, company and email.' }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, ...(await joinWaitlist(parsed.data, hashedIp(req.headers.get('x-forwarded-for')))) });
  } catch (err) {
    if (err instanceof SignupError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}
