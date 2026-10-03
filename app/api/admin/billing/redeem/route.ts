import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminTenant, forbidden } from '@/lib/adminApi';
import { redeemPromoCode, PlatformError } from '@/lib/platform';

const schema = z.object({ code: z.string().trim().min(1) });

export async function POST(req: Request) {
  const tenantId = await adminTenant();
  if (!tenantId) return forbidden();
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Enter a code.' }, { status: 400 });

  try {
    await redeemPromoCode(tenantId, parsed.data.code);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof PlatformError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error('[billing] redeem failed', err);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
