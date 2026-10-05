import { NextResponse } from 'next/server';
import { completeSignup, completeSchema, SignupError } from '@/lib/signup';

export async function POST(req: Request) {
  const parsed = completeSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    const msg: Record<string, string> = {
      password: 'Use a password of at least 10 characters.',
      acceptTerms: 'Please accept the terms to continue.',
      answers: 'Answer the questions above.',
      companyName: 'Add your company name.',
      name: 'Add your name.',
    };
    return NextResponse.json({ error: msg[String(field)] ?? 'Check the form and try again.' }, { status: 400 });
  }
  try {
    const r = await completeSignup(parsed.data);
    return NextResponse.json({ ok: true, slug: r.slug });
  } catch (err) {
    if (err instanceof SignupError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}
