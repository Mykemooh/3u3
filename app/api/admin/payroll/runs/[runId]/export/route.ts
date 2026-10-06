import { NextResponse } from 'next/server';
import { adminTenant, forbidden } from '@/lib/adminApi';
import { getPayrollRun, payrollRunToCsv } from '@/lib/payroll';
import { gustoCsv } from '@/lib/gusto';

/** ?format=gusto lays the run out like Gusto's hours-and-earnings import (lib/gusto.ts). */
export async function GET(req: Request, { params }: { params: { runId: string } }) {
  const tenantId = await adminTenant();
  if (!tenantId) return forbidden();

  const data = await getPayrollRun(tenantId, params.runId);
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const gusto = new URL(req.url).searchParams.get('format') === 'gusto';
  return new NextResponse(gusto ? gustoCsv(data.rows) : payrollRunToCsv(data.rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="payroll-${gusto ? 'gusto-' : ''}${data.run.periodStart}-to-${data.run.periodEnd}.csv"`,
    },
  });
}
