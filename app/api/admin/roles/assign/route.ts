import { NextResponse } from 'next/server';
import { adminSession, forbidden, teamApiError } from '@/lib/adminApi';
import { assignRole, getUserRole } from '@/lib/roles';
import { logChange } from '@/lib/audit';

export async function POST(req: Request) {
  const admin = await adminSession();
  if (!admin) return forbidden();
  const body = await req.json().catch(() => ({}));
  if (typeof body.userId !== 'string' || typeof body.roleId !== 'string') {
    return NextResponse.json({ error: 'Pick a person and a role.' }, { status: 400 });
  }
  try {
    const before = (await getUserRole(body.userId)).role;
    const { user, role } = await assignRole(admin.tenantId, body.userId, body.roleId);
    await logChange({
      tenantId: admin.tenantId,
      actor: { id: admin.userId, name: admin.name },
      entityType: 'team_member',
      entityId: user.id,
      action: 'role_changed',
      summary: `Moved ${user.name} from "${before?.name ?? '—'}" to "${role.name}"`,
      changes: [{ field: 'role', from: before?.name ?? null, to: role.name }],
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return teamApiError(err);
  }
}
