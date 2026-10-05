import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminSession, forbidden, teamApiError } from '@/lib/adminApi';
import { updateRole, deleteRole } from '@/lib/roles';
import { logChange, diff } from '@/lib/audit';

const schema = z.object({
  name: z.string().min(1).max(40).optional(),
  permissions: z.array(z.string()).optional(),
  staffRole: z.enum(['TEAM_LEAD', 'CLEANER', 'JR_CLEANER']).optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const admin = await adminSession();
  if (!admin) return forbidden();
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid change' }, { status: 400 });
  try {
    const { before, after } = await updateRole(admin.tenantId, params.id, parsed.data as never);
    const changes = diff(before, after, ['name', 'permissions', 'staffRole']);
    if (changes.length) {
      await logChange({
        tenantId: admin.tenantId,
        actor: { id: admin.userId, name: admin.name },
        entityType: 'role',
        entityId: after.id,
        action: 'updated',
        summary: before.name !== after.name ? `Renamed "${before.name}" to "${after.name}"` : `Changed what "${after.name}" can do`,
        changes,
      });
    }
    return NextResponse.json({ role: after });
  } catch (err) {
    return teamApiError(err);
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const admin = await adminSession();
  if (!admin) return forbidden();
  try {
    const role = await deleteRole(admin.tenantId, params.id);
    await logChange({ tenantId: admin.tenantId, actor: { id: admin.userId, name: admin.name }, entityType: 'role', entityId: role.id, action: 'deleted', summary: `Deleted the role "${role.name}"` });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return teamApiError(err);
  }
}
