import { NextResponse } from 'next/server';
import { z } from 'zod';
import { superAdminId, teamApiError } from '@/lib/adminApi';
import { createRole } from '@/lib/roles';
import { platformTenantId } from '@/lib/platformRoles';

const schema = z.object({
  name: z.string().min(1).max(40),
  baseRole: z.enum(['ADMIN', 'CLEANER']),
  staffRole: z.enum(['TEAM_LEAD', 'CLEANER', 'JR_CLEANER']).nullish(),
  permissions: z.array(z.string()).default([]),
});

/** Adds a role to the template new companies start with. */
export async function POST(req: Request) {
  if (!(await superAdminId())) return NextResponse.json({ error: 'Platform owner only' }, { status: 403 });
  const tenantId = await platformTenantId();
  if (!tenantId) return NextResponse.json({ error: 'No platform set up' }, { status: 500 });
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Give the role a name and a type.' }, { status: 400 });
  try {
    return NextResponse.json({ role: await createRole(tenantId, { ...parsed.data, permissions: parsed.data.permissions as never[] }) });
  } catch (err) {
    return teamApiError(err);
  }
}
