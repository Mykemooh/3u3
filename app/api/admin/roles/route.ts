import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminSession, forbidden, teamApiError } from '@/lib/adminApi';
import { createRole } from '@/lib/roles';
import { logChange } from '@/lib/audit';

const schema = z.object({
  name: z.string().min(1).max(40),
  baseRole: z.enum(['ADMIN', 'CLEANER']),
  staffRole: z.enum(['TEAM_LEAD', 'CLEANER', 'JR_CLEANER']).nullish(),
  permissions: z.array(z.string()).default([]),
});

export async function POST(req: Request) {
  const admin = await adminSession();
  if (!admin) return forbidden();
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Give the role a name and a type.' }, { status: 400 });
  try {
    const role = await createRole(admin.tenantId, { ...parsed.data, permissions: parsed.data.permissions as never[] });
    await logChange({ tenantId: admin.tenantId, actor: { id: admin.userId, name: admin.name }, entityType: 'role', entityId: role.id, action: 'created', summary: `Added the role "${role.name}"` });
    return NextResponse.json({ role });
  } catch (err) {
    return teamApiError(err);
  }
}
