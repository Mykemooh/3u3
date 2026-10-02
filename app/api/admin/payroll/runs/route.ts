import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminTenant, forbidden } from '@/lib/adminApi';
import { createPayrollRun, PayrollError } from '@/lib/payroll';

const schema = z.object({
  label: z.string().trim().min(1).max(100),
  periodStart: z.string().trim(),
  periodEnd: z.string().trim(),
});

export async function POST(req: Request) {
  const tenantId = await adminTenant();
  if (!tenantId) return forbidden();
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  try {
    const runId = await createPayrollRun(tenantId, parsed.data);
    return NextResponse.json({ runId });
  } catch (err) {
    if (err instanceof PayrollError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}
