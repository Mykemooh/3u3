import { NextResponse } from 'next/server';
import { z } from 'zod';
import { setJobStaff } from '@/lib/team';
import { scheduleChanged } from '@/lib/events';
import { adminTenant, forbidden, teamApiError } from '@/lib/adminApi';

const schema = z.object({ userIds: z.array(z.string().min(1)).max(50) });

// Exactly who works this one job — stored as swaps against its team.
export async function PUT(req: Request, { params }: { params: { jobId: string } }) {
  const tenantId = await adminTenant();
  if (!tenantId) return forbidden();
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  try {
    await setJobStaff(tenantId, params.jobId, parsed.data.userIds);
    await scheduleChanged(tenantId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return teamApiError(err);
  }
}
