import { db } from '@/db/client';
import { tenants, users, jobs, bookings, crewMembers, crews } from '@/db/schema';
import { and, eq, gte, inArray, ne } from 'drizzle-orm';
import { previewPayroll } from '@/lib/payroll';
import { addDays, toDate, toISO } from '@/lib/recurring';
import { businessTodayISO } from '@/lib/time';
import { staffForJobs, jobIdsForEmployee } from '@/lib/team';
import { getUserRole } from '@/lib/roles';

/**
 * A cleaner's own numbers for their dashboard: the pay period they're in,
 * what they've earned in it so far (from the same calculation payroll
 * runs use — lib/payroll.ts previewPayroll — so the two can never
 * disagree), and when and how much the next payout is.
 *
 * Paydays come from Admin → Settings → Payroll calendar: a frequency and,
 * for weekly or every-two-weeks pay, one real payday to count from. A pay
 * period runs from the last payday up to the day before the next one.
 */

export type Frequency = 'WEEKLY' | 'BIWEEKLY' | 'SEMIMONTHLY' | 'MONTHLY';

const lastDayOfMonth = (y: number, m: number) => toISO(new Date(Date.UTC(y, m + 1, 0)));

/** The next payday on or after `today`, and the one before it. Null when the calendar isn't set. */
export function payPeriod(frequency: Frequency, anchor: string | null, today: string): { start: string; end: string; payday: string } | null {
  if (frequency === 'WEEKLY' || frequency === 'BIWEEKLY') {
    if (!anchor) return null;
    const step = frequency === 'WEEKLY' ? 7 : 14;
    const diff = Math.round((toDate(today).getTime() - toDate(anchor).getTime()) / 86400000);
    const k = Math.ceil(diff / step);
    const payday = addDays(anchor, k * step);
    const prev = addDays(payday, -step);
    return { start: prev, end: addDays(payday, -1), payday };
  }
  const t = toDate(today);
  const y = t.getUTCFullYear();
  const m = t.getUTCMonth();
  if (frequency === 'SEMIMONTHLY') {
    const mid = toISO(new Date(Date.UTC(y, m, 15)));
    const last = lastDayOfMonth(y, m);
    if (today <= mid) return { start: lastDayOfMonth(y, m - 1), end: addDays(mid, -1), payday: mid };
    return { start: mid, end: addDays(last, -1), payday: last };
  }
  // MONTHLY: the anchor's day of month, or the last day.
  const day = anchor ? Number(anchor.slice(8, 10)) : 31;
  const candidate = (yy: number, mm: number) => {
    const lastDay = Number(lastDayOfMonth(yy, mm).slice(8, 10));
    return toISO(new Date(Date.UTC(yy, mm, Math.min(day, lastDay))));
  };
  let payday = candidate(y, m);
  if (payday < today) payday = candidate(y, m + 1);
  const pd = toDate(payday);
  const prev = candidate(pd.getUTCFullYear(), pd.getUTCMonth() - 1);
  return { start: prev, end: addDays(payday, -1), payday };
}

export type CrewDashboard = Awaited<ReturnType<typeof crewDashboard>>;

export async function crewDashboard(userId: string) {
  const user = (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0];
  if (!user) return null;
  const tenant = (await db.select().from(tenants).where(eq(tenants.id, user.tenantId)).limit(1))[0]!;
  const today = businessTodayISO();
  const { role, permissions } = await getUserRole(userId);

  // ---- Jobs: today and the next 7 days, with who they're working with.
  const ids = await jobIdsForEmployee(userId);
  const jobRows = ids.length ? await db.select().from(jobs).where(inArray(jobs.id, ids)) : [];
  const bookingRows = jobRows.length
    ? await db
        .select()
        .from(bookings)
        .where(and(inArray(bookings.id, jobRows.map((j) => j.bookingId)), ne(bookings.status, 'CANCELLED'), gte(bookings.slotStart, today)))
    : [];
  const weekEnd = addDays(today, 7);
  const soon = bookingRows.filter((b) => b.slotStart.slice(0, 10) <= weekEnd).sort((a, b) => a.slotStart.localeCompare(b.slotStart));
  const soonJobs = soon.map((b) => jobRows.find((j) => j.bookingId === b.id)!).filter(Boolean);
  const staff = await staffForJobs(soonJobs.map((j) => ({ id: j.id, crewId: j.crewId })));
  const everyone = [...new Set(Object.values(staff).flat())];
  const people = everyone.length ? await db.select().from(users).where(inArray(users.id, everyone)) : [];
  const clientIds = [...new Set(soon.map((b) => b.clientId))];
  const clients = clientIds.length ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, clientIds)) : [];
  const crewRows = await db.select().from(crews).where(eq(crews.tenantId, tenant.id));

  const upcoming = soon.map((b) => {
    const job = jobRows.find((j) => j.bookingId === b.id)!;
    const team = (staff[job.id] ?? []).map((id) => people.find((p) => p.id === id)).filter(Boolean) as typeof people;
    const leads = team.filter((p) => p.staffRole === 'TEAM_LEAD');
    const iLead = user.staffRole === 'TEAM_LEAD' || (leads.length === 0 && team[0]?.id === user.id);
    return {
      jobId: job.id,
      jobStatus: job.status,
      date: b.slotStart.slice(0, 10),
      slotStart: b.slotStart,
      slotEnd: b.slotEnd,
      clientName: clients.find((c) => c.id === b.clientId)?.name ?? 'Client',
      crewName: crewRows.find((c) => c.id === job.crewId)?.name ?? 'Team',
      placement: iLead ? 'Lead' : 'Team member',
      teammates: team.filter((p) => p.id !== user.id).map((p) => p.name.split(/[\s(]/)[0]),
      priceCents: permissions.has('crew.pricing') ? b.priceCents : null,
    };
  });

  // ---- Earnings and payout.
  const period = payPeriod(tenant.payrollFrequency, tenant.payrollAnchorDate, today);
  let earned: { payCents: number | null; tipCents: number; jobs: number; hours: number } | null = null;
  if (period) {
    const rows = await previewPayroll(tenant.id, period.start, period.end);
    const mine = rows.find((r) => r.employeeId === userId);
    earned = mine
      ? { payCents: mine.payCents, tipCents: mine.tipCents, jobs: mine.jobCount, hours: mine.hours }
      : { payCents: 0, tipCents: 0, jobs: 0, hours: 0 };
  }
  const membership = (await db.select().from(crewMembers).where(eq(crewMembers.userId, userId)).limit(1))[0];

  return {
    user: { id: user.id, name: user.name, firstName: user.name.split(/[\s(]/)[0], roleName: role?.name ?? null, payType: user.payType },
    teamName: membership ? crewRows.find((c) => c.id === membership.crewId)?.name ?? null : null,
    today: upcoming.filter((u) => u.date === today),
    upcoming: upcoming.filter((u) => u.date > today),
    period,
    earned,
    rateSet: user.payType === 'HOURLY' ? user.payRateCentsPerHour != null : user.payType === 'PER_CLEAN' ? user.payRateCentsPerClean != null : user.payType === 'DAY_RATE' ? user.payRateCentsPerDay != null : user.payRatePercentBps != null,
    frequency: tenant.payrollFrequency,
  };
}
