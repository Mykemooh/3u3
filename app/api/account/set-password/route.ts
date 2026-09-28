import { NextResponse } from 'next/server';
import { z } from 'zod';
import { setPasswordFromToken } from '@/lib/passwordSetup';

const schema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
});

// Setting the password IS what turns sign-in on for this account — there's
// no separate approval step, so the identifier returned here is already
// usable against /api/auth the moment this responds.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request.' }, { status: 400 });
  }

  const result = await setPasswordFromToken(parsed.data.token, parsed.data.password);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, identifier: result.identifier, name: result.name, role: result.role });
}
