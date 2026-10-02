import { NextResponse } from 'next/server';
import { z } from 'zod';
import { moveEmployee, setStaffRole, setPayRates } from '@/lib/team';
import { adminTenant, forbidden, teamApiError } from '@/lib/adminApi';

const schema = z.object({
  // null = take them off every team ("Unassigned").
  crewId: z.string().min(1).nullable().optional(),
  staffRole: z.enum(['TEAM_LEAD', 'CLEANER', 'JR_CLEANER']).optional(),
  payType: z.enum(['HOURLY', 'PER_CLEAN', 'DAY_RATE']).optional(),
  // Dollars, as typed in the admin UI; null clears that rate. Stored as
  // cents (lib/payroll.ts reads the *_Cents* columns directly).
  payRatePerHour: z.number().nonnegative().nullable().optional(),
  payRatePerClean: z.number().nonnegative().nullable().optional(),
  payRatePerDay: z.number().nonnegative().nullable().optional(),
});

// Drag an employee card to another team, change their role, or set their
// pay type/rate (used by the payroll workflow, lib/payroll.ts).
export async function PATCH(req: Request, { params }: { params: { userId: string } }) {
  const tenantId = await adminTenant();
  if (!tenantId) return forbidden();
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  try {
    if (parsed.data.crewId !== undefined) await moveEmployee(tenantId, params.userId, parsed.data.crewId);
    if (parsed.data.staffRole) await setStaffRole(tenantId, params.userId, parsed.data.staffRole);
    const toCents = (v: number | null | undefined) => (v === undefined ? undefined : v == null ? null : Math.round(v * 100));
    await setPayRates(tenantId, params.userId, {
      payType: parsed.data.payType,
      payRateCentsPerHour: toCents(parsed.data.payRatePerHour),
      payRateCentsPerClean: toCents(parsed.data.payRatePerClean),
      payRateCentsPerDay: toCents(parsed.data.payRatePerDay),
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return teamApiError(err);
  }
}
