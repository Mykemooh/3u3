import { NextResponse } from 'next/server';
import { z } from 'zod';
import { moveEmployee, setStaffRole } from '@/lib/team';
import { adminTenant, forbidden, teamApiError } from '@/lib/adminApi';

const schema = z.object({
  // null = take them off every team ("Unassigned").
  crewId: z.string().min(1).nullable().optional(),
  staffRole: z.enum(['TEAM_LEAD', 'CLEANER', 'JR_CLEANER']).optional(),
});

// Drag an employee card to another team, or change their role.
export async function PATCH(req: Request, { params }: { params: { userId: string } }) {
  const tenantId = await adminTenant();
  if (!tenantId) return forbidden();
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  try {
    if (parsed.data.crewId !== undefined) await moveEmployee(tenantId, params.userId, parsed.data.crewId);
    if (parsed.data.staffRole) await setStaffRole(tenantId, params.userId, parsed.data.staffRole);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return teamApiError(err);
  }
}
