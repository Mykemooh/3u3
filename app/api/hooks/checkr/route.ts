import { NextResponse } from 'next/server';
import { verifyCheckrSignature, handleCheckrEvent } from '@/lib/checkr';

export const dynamic = 'force-dynamic';

/**
 * Checkr webhook (Checkr dashboard → Account settings → Developer
 * settings → Webhooks, pointed at <site>/api/hooks/checkr). Signed with
 * the API key in X-Checkr-Signature; anything unsigned is refused.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyCheckrSignature(raw, req.headers.get('x-checkr-signature'))) {
    return NextResponse.json({ error: 'Bad signature' }, { status: 401 });
  }
  try {
    const result = await handleCheckrEvent(JSON.parse(raw));
    return NextResponse.json(result);
  } catch (err) {
    console.error('[checkr] webhook failed', err);
    return NextResponse.json({ error: 'Could not process' }, { status: 500 });
  }
}
