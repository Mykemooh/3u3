import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminTenant, forbidden } from '@/lib/adminApi';
import { markPayrollRunPaid, voidPayrollRun, PayrollError } from '@/lib/payroll';

const schema = z.object({ action: z.enum(['pay', 'void']) });

export async function POST(req: Request, { params }: { params: { runId: string } }) {
  const tenantId = await adminTenant();
  if (!tenantId) return forbidden();
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  try {
    if (parsed.data.action === 'pay') await markPayrollRunPaid(tenantId, params.runId);
    else await voidPayrollRun(tenantId, params.runId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof PayrollError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}
