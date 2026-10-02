import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createTeam } from '@/lib/team';
import { adminTenant, forbidden, teamApiError } from '@/lib/adminApi';

const schema = z.object({ name: z.string().trim().min(1).max(60) });

export async function POST(req: Request) {
  const tenantId = await adminTenant();
  if (!tenantId) return forbidden();
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Give the team a name.' }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, crewId: await createTeam(tenantId, parsed.data.name) });
  } catch (err) {
    return teamApiError(err);
  }
}
