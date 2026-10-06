import { NextResponse } from 'next/server';
import { adminSession, forbidden } from '@/lib/adminApi';
import { removeConnection } from '@/lib/companyConnections';

export async function POST() {
  const admin = await adminSession();
  if (!admin) return forbidden();
  await removeConnection(admin.tenantId, 'XERO', { id: admin.userId, name: admin.name }, 'Xero');
  return NextResponse.json({ ok: true });
}
