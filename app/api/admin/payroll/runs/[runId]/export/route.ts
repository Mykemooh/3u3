import { NextResponse } from 'next/server';
import { adminTenant, forbidden } from '@/lib/adminApi';
import { getPayrollRun, payrollRunToCsv } from '@/lib/payroll';

export async function GET(_req: Request, { params }: { params: { runId: string } }) {
  const tenantId = await adminTenant();
  if (!tenantId) return forbidden();

  const data = await getPayrollRun(tenantId, params.runId);
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return new NextResponse(payrollRunToCsv(data.rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="payroll-${data.run.periodStart}-to-${data.run.periodEnd}.csv"`,
    },
  });
}
