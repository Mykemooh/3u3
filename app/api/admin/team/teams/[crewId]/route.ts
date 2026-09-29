import { NextResponse } from 'next/server';
import { z } from 'zod';
import { updateTeam } from '@/lib/team';
import { adminTenant, forbidden, teamApiError } from '@/lib/adminApi';

const schema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  acceptsBookings: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: { crewId: string } }) {
  const tenantId = await adminTenant();
  if (!tenantId) return forbidden();
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  try {
    await updateTeam(tenantId, params.crewId, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return teamApiError(err);
  }
}
