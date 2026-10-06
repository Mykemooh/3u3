import { NextResponse } from 'next/server';
import { adminSession, forbidden } from '@/lib/adminApi';
import { belongsTo, notFound } from '@/lib/tenantGuard';
import { sendTestEvent } from '@/lib/webhooks';
import { developersError } from '@/lib/developersApi';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const admin = await adminSession();
  if (!admin) return forbidden();
  if (!(await belongsTo(admin.tenantId, 'webhook', params.id))) return notFound();
  try {
    const d = await sendTestEvent(admin.tenantId, params.id);
    return NextResponse.json({ status: d?.status, code: d?.lastStatusCode, error: d?.lastError });
  } catch (err) {
    return developersError(err);
  }
}
