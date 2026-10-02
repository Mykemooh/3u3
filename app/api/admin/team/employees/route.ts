import { NextResponse } from 'next/server';
import { z } from 'zod';
import { addEmployee } from '@/lib/team';
import { adminTenant, forbidden, teamApiError } from '@/lib/adminApi';

const schema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email('Enter a valid email — it’s how they sign in.'),
  phone: z.string().trim().max(30).optional(),
  staffRole: z.enum(['TEAM_LEAD', 'CLEANER', 'JR_CLEANER']),
  crewId: z.string().min(1).nullable(),
});

// New employee: a cleaner login, emailed a link to create their password.
export async function POST(req: Request) {
  const tenantId = await adminTenant();
  if (!tenantId) return forbidden();
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
  }
  try {
    return NextResponse.json({ ok: true, userId: await addEmployee(tenantId, parsed.data) });
  } catch (err) {
    return teamApiError(err);
  }
}
