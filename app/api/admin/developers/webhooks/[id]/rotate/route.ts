import { NextResponse } from 'next/server';
import { adminSession, forbidden } from '@/lib/adminApi';
import { belongsTo, notFound } from '@/lib/tenantGuard';
import { rotateEndpointSecret } from '@/lib/webhooks';
import { developersError } from '@/lib/developersApi';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const admin = await adminSession();
  if (!admin) return forbidden();
  if (!(await belongsTo(admin.tenantId, 'webhook', params.id))) return notFound();
  try {
    const { secret } = await rotateEndpointSecret(admin.tenantId, params.id, { id: admin.userId, name: admin.name });
    return NextResponse.json({ secret }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return developersError(err);
  }
}
