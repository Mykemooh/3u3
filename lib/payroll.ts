import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { jobs, bookings, users } from '@/db/schema';
import { staffForJobs } from '@/lib/team';

export type PayrollRow = {
  employeeId: string;
  name: string;
  payRateCentsPerHour: number | null;
  hours: number;
  jobCount: number;
  payCents: number | null;
};

/**
 * Hours worked per cleaner over a date range, from real clock-in/clock-
 * out timestamps (jobs.startedAt/completedAt), times their admin-set
 * hourly rate (users.payRateCentsPerHour, Admin → Team). This is a
 * foundation for payroll, not a processor integration: there's no
 * genuinely free payroll-processing API to run real paychecks through
 * (Gusto, ADP, Deel, and QuickBooks Payroll are all paid products), so
 * this computes real numbers from real data and exports them as CSV —
 * handed to whichever processor the business already uses, including
 * QuickBooks Payroll now that lib/quickbooks.ts is connected for
 * invoicing. Wiring an actual processor API is the natural next step
 * once the business picks one.
 *
 * A job's actual duration is split evenly across everyone staffed on it
 * (lib/team.ts staffForJobs) — individual clock-in/out per person on a
 * multi-person job isn't tracked, only the job's.
 */
export async function getPayrollReport(tenantId: string, startDateISO: string, endDateISO: string): Promise<PayrollRow[]> {
  const rows = await db
    .select({ job: jobs, booking: bookings })
    .from(jobs)
    .innerJoin(bookings, eq(jobs.bookingId, bookings.id))
    .where(and(eq(bookings.tenantId, tenantId), eq(jobs.status, 'COMPLETE'), isNotNull(jobs.startedAt), isNotNull(jobs.completedAt)));

  const inRange = rows.filter((r) => r.booking.slotStart.slice(0, 10) >= startDateISO && r.booking.slotStart.slice(0, 10) <= endDateISO);
  if (inRange.length === 0) return [];

  const staffMap = await staffForJobs(inRange.map((r) => ({ id: r.job.id, crewId: r.job.crewId })));

  const totals = new Map<string, { hours: number; jobCount: number }>();
  for (const r of inRange) {
    const staffIds = staffMap[r.job.id] ?? [];
    if (staffIds.length === 0) continue;
    const durationHours = (r.job.completedAt!.getTime() - r.job.startedAt!.getTime()) / 3_600_000;
    const perPerson = durationHours / staffIds.length;
    for (const uid of staffIds) {
      const entry = totals.get(uid) ?? { hours: 0, jobCount: 0 };
      entry.hours += perPerson;
      entry.jobCount += 1;
      totals.set(uid, entry);
    }
  }

  const employeeIds = [...totals.keys()];
  if (employeeIds.length === 0) return [];
  const employees = await db.select().from(users).where(inArray(users.id, employeeIds));

  return employees
    .map((e) => {
      const entry = totals.get(e.id)!;
      const hours = Math.round(entry.hours * 100) / 100;
      return {
        employeeId: e.id,
        name: e.name,
        payRateCentsPerHour: e.payRateCentsPerHour,
        hours,
        jobCount: entry.jobCount,
        payCents: e.payRateCentsPerHour != null ? Math.round(hours * e.payRateCentsPerHour) : null,
      };
    })
    .sort((a, b) => b.hours - a.hours);
}

export function payrollToCsv(rows: PayrollRow[]): string {
  const lines = ['Name,Hours,Jobs,Rate ($/hr),Pay'];
  for (const r of rows) {
    const rate = r.payRateCentsPerHour != null ? (r.payRateCentsPerHour / 100).toFixed(2) : '';
    const pay = r.payCents != null ? (r.payCents / 100).toFixed(2) : '';
    lines.push([`"${r.name.replace(/"/g, '""')}"`, r.hours.toFixed(2), r.jobCount, rate, pay].join(','));
  }
  return lines.join('\n');
}
