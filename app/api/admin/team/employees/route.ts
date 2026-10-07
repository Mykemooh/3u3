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
  payType: z.enum(['HOURLY', 'PER_CLEAN', 'DAY_RATE']).optional(),
  // Dollars, as typed in the admin UI — converted to cents here.
  payRatePerHour: z.number().nonnegative().nullable().optional(),
  payRatePerClean: z.number().nonnegative().nullable().optional(),
  payRatePerDay: z.number().nonnegative().nullable().optional(),
  // Their language for the invite email (and later account emails).
  locale: z.enum(['en', 'es']).optional(),
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
    const { payRatePerHour, payRatePerClean, payRatePerDay, ...rest } = parsed.data;
    const toCents = (v: number | null | undefined) => (v == null ? null : Math.round(v * 100));
    const userId = await addEmployee(tenantId, {
      ...rest,
      payRateCentsPerHour: toCents(payRatePerHour),
      payRateCentsPerClean: toCents(payRatePerClean),
      payRateCentsPerDay: toCents(payRatePerDay),
    });
    return NextResponse.json({ ok: true, userId });
  } catch (err) {
    return teamApiError(err);
  }
}
