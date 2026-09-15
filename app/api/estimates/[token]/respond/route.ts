import { NextResponse } from 'next/server';
import { z } from 'zod';
import { respondToEstimate, EstimateError } from '@/lib/estimates';

const schema = z.object({ action: z.enum(['APPROVE', 'DECLINE']) });

// Public on purpose: the client has no account at this point, so the
// long random token in the URL *is* the credential (same model as
// Stripe's hosted invoice links). The token is only ever minted when an
// estimate is sent, is unique, and grants nothing beyond answering this
// one estimate.
export async function POST(req: Request, { params }: { params: { token: string } }) {
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  try {
    const result = await respondToEstimate(params.token, parsed.data.action);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof EstimateError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}
