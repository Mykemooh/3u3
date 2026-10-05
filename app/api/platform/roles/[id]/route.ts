import { NextResponse } from 'next/server';
import { z } from 'zod';
import { superAdminId, teamApiError } from '@/lib/adminApi';
import { updateRole, deleteRole } from '@/lib/roles';
import { platformTenantId } from '@/lib/platformRoles';

const schema = z.object({
  name: z.string().min(1).max(40).optional(),
  permissions: z.array(z.string()).optional(),
  staffRole: z.enum(['TEAM_LEAD', 'CLEANER', 'JR_CLEANER']).optional(),
});

/** Renames or re-scopes a template role. Existing companies keep their own copies. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  if (!(await superAdminId())) return NextResponse.json({ error: 'Platform owner only' }, { status: 403 });
  const tenantId = await platformTenantId();
  if (!tenantId) return NextResponse.json({ error: 'No platform set up' }, { status: 500 });
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid change' }, { status: 400 });
  try {
    const { after } = await updateRole(tenantId, params.id, parsed.data as never);
    return NextResponse.json({ role: after });
  } catch (err) {
    return teamApiError(err);
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  if (!(await superAdminId())) return NextResponse.json({ error: 'Platform owner only' }, { status: 403 });
  const tenantId = await platformTenantId();
  if (!tenantId) return NextResponse.json({ error: 'No platform set up' }, { status: 500 });
  try {
    await deleteRole(tenantId, params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return teamApiError(err);
  }
}
