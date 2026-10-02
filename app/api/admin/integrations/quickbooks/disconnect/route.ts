import { NextResponse } from 'next/server';
import { adminTenant, forbidden } from '@/lib/adminApi';
import { disconnectQuickbooks } from '@/lib/quickbooks';

export async function POST() {
  const tenantId = await adminTenant();
  if (!tenantId) return forbidden();
  await disconnectQuickbooks(tenantId);
  return NextResponse.json({ ok: true });
}
