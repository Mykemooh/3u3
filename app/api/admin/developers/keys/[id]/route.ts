import { NextResponse } from 'next/server';
import { adminSession, forbidden } from '@/lib/adminApi';
import { belongsTo, notFound } from '@/lib/tenantGuard';
import { revokeApiKey } from '@/lib/apiKeys';
import { developersError } from '@/lib/developersApi';

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const admin = await adminSession();
  if (!admin) return forbidden();
  if (!(await belongsTo(admin.tenantId, 'api_key', params.id))) return notFound();
  try {
    await revokeApiKey(admin.tenantId, params.id, { id: admin.userId, name: admin.name });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return developersError(err);
  }
}
