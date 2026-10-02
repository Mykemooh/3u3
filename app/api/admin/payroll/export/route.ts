import { NextResponse } from 'next/server';
import { adminTenant, forbidden } from '@/lib/adminApi';
import { getPayrollReport, payrollToCsv } from '@/lib/payroll';

export async function GET(req: Request) {
  const tenantId = await adminTenant();
  if (!tenantId) return forbidden();

  const url = new URL(req.url);
  const start = url.searchParams.get('start');
  const end = url.searchParams.get('end');
  if (!start || !end) return NextResponse.json({ error: 'start and end are required' }, { status: 400 });

  const rows = await getPayrollReport(tenantId, start, end);
  return new NextResponse(payrollToCsv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="payroll-${start}-to-${end}.csv"`,
    },
  });
}
