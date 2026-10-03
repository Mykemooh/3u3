import { NextResponse } from 'next/server';
import { adminTenant, forbidden } from '@/lib/adminApi';
import { resolveSupplyReport, SupplyReportError } from '@/lib/supplies';

export async function PATCH(_req: Request, { params }: { params: { id: string } }) {
  const tenantId = await adminTenant();
  if (!tenantId) return forbidden();
  try {
    await resolveSupplyReport(tenantId, params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof SupplyReportError) return NextResponse.json({ error: err.message }, { status: 404 });
    throw err;
  }
}
