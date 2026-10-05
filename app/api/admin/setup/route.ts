import { NextResponse } from 'next/server';
import { adminSession, forbidden } from '@/lib/adminApi';
import { skipSetupStep } from '@/lib/setupGuide';

/** Mark a setup-guide step "I don't need this" (or bring it back). */
export async function POST(req: Request) {
  const admin = await adminSession();
  if (!admin) return forbidden();
  const body = await req.json().catch(() => ({}));
  if (typeof body.key !== 'string' || !/^[a-z-]{2,40}$/.test(body.key)) {
    return NextResponse.json({ error: 'Unknown step' }, { status: 400 });
  }
  await skipSetupStep(admin.tenantId, body.key, body.skip !== false);
  return NextResponse.json({ ok: true });
}
