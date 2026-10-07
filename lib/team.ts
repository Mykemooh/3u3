import { normalizePhone, samePhone } from '@/lib/phone';
import { db } from '@/db/client';
import { crews, crewMembers, users, jobs, jobStaff } from '@/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { issuePasswordSetupToken } from '@/lib/passwordSetup';
import { sendEmail, passwordSetupEmail } from '@/lib/email';
import type { Locale } from '@/lib/i18n';
import { appUrl } from '@/lib/url';

/**
 * Teams and who's on each job.
 *
 * An employee (a CLEANER user) belongs to at most one team (crew). A job
 * belongs to a team, and is staffed by that team's members — adjusted per
 * job by job_staff rows (ADD someone from elsewhere, REMOVE a member).
 * Everything that asks "who's on this job?" or "can this person work
 * it?" comes through here, so the crew app, the schedule board and the
 * employee view always agree.
 */

export type StaffRole = 'TEAM_LEAD' | 'CLEANER' | 'JR_CLEANER';

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  TEAM_LEAD: 'Team Lead',
  CLEANER: 'Cleaner',
  JR_CLEANER: 'Jr. Cleaner',
};

export class TeamError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export type Employee = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  staffRole: StaffRole;
  crewId: string | null;
};

/** Every employee in the business, with their team (if any). */
export async function getEmployees(tenantId: string): Promise<Employee[]> {
  const staff = await db
    .select()
    .from(users)
    .where(and(eq(users.tenantId, tenantId), eq(users.role, 'CLEANER')));
  const memberships = staff.length
    ? await db.select().from(crewMembers).where(inArray(crewMembers.userId, staff.map((u) => u.id)))
    : [];
  return staff
    .map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      staffRole: (u.staffRole ?? 'CLEANER') as StaffRole,
      crewId: memberships.find((m) => m.userId === u.id)?.crewId ?? null,
    }))
    .sort((a, b) => roleOrder(a.staffRole) - roleOrder(b.staffRole) || a.name.localeCompare(b.name));
}

function roleOrder(role: StaffRole) {
  return role === 'TEAM_LEAD' ? 0 : role === 'CLEANER' ? 1 : 2;
}

export async function getTeams(tenantId: string) {
  return (await db.select().from(crews).where(eq(crews.tenantId, tenantId))).sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );
}

async function requireEmployee(tenantId: string, userId: string) {
  const user = (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0];
  if (!user || user.tenantId !== tenantId || user.role !== 'CLEANER') throw new TeamError('Employee not found', 404);
  return user;
}

async function requireTeam(tenantId: string, crewId: string) {
  const crew = (await db.select().from(crews).where(eq(crews.id, crewId)).limit(1))[0];
  if (!crew || crew.tenantId !== tenantId) throw new TeamError('Team not found', 404);
  return crew;
}

/** Put an employee on a team (or none). One team per person. */
export async function moveEmployee(tenantId: string, userId: string, crewId: string | null) {
  await requireEmployee(tenantId, userId);
  if (crewId) await requireTeam(tenantId, crewId);
  await db.transaction(async (tx) => {
    await tx.delete(crewMembers).where(eq(crewMembers.userId, userId));
    if (crewId) await tx.insert(crewMembers).values({ id: crypto.randomUUID(), crewId, userId });
  });
}

export async function setStaffRole(tenantId: string, userId: string, staffRole: StaffRole) {
  await requireEmployee(tenantId, userId);
  await db.update(users).set({ staffRole }).where(eq(users.id, userId));
}

/** Pay type and rate(s) for the payroll workflow (lib/payroll.ts). Any field left out is unchanged; null clears that rate. */
export async function setPayRates(
  tenantId: string,
  userId: string,
  input: {
    payType?: 'HOURLY' | 'PER_CLEAN' | 'DAY_RATE' | 'PERCENTAGE';
    payRateCentsPerHour?: number | null;
    payRateCentsPerClean?: number | null;
    payRateCentsPerDay?: number | null;
    payRatePercentBps?: number | null;
  },
) {
  await requireEmployee(tenantId, userId);
  const set: Record<string, unknown> = {};
  if (input.payType !== undefined) set.payType = input.payType;
  if (input.payRateCentsPerHour !== undefined) set.payRateCentsPerHour = input.payRateCentsPerHour;
  if (input.payRateCentsPerClean !== undefined) set.payRateCentsPerClean = input.payRateCentsPerClean;
  if (input.payRateCentsPerDay !== undefined) set.payRateCentsPerDay = input.payRateCentsPerDay;
  if (input.payRatePercentBps !== undefined) set.payRatePercentBps = input.payRatePercentBps;
  if (Object.keys(set).length === 0) return;
  await db.update(users).set(set).where(eq(users.id, userId));
}

export async function createTeam(tenantId: string, name: string) {
  const id = crypto.randomUUID();
  // Off for online bookings until the office has staffed it and switches it on.
  await db.insert(crews).values({ id, tenantId, name, acceptsBookings: false });
  return id;
}

export async function updateTeam(tenantId: string, crewId: string, patch: { name?: string; acceptsBookings?: boolean }) {
  await requireTeam(tenantId, crewId);
  await db.update(crews).set(patch).where(eq(crews.id, crewId));
}

/**
 * A new employee: a CLEANER login, on a team if one's given, emailed the
 * same "create your password" link a new client gets.
 */
export async function addEmployee(
  tenantId: string,
  input: {
    name: string;
    email: string;
    phone?: string;
    staffRole: StaffRole;
    crewId: string | null;
    payType?: 'HOURLY' | 'PER_CLEAN' | 'DAY_RATE';
    payRateCentsPerHour?: number | null;
    payRateCentsPerClean?: number | null;
    payRateCentsPerDay?: number | null;
    /** Their language for the invite and later account emails; default English. */
    locale?: Locale;
  },
) {
  const email = input.email.trim().toLowerCase();
  const taken = (await db.select().from(users).where(eq(users.email, email)).limit(1))[0];
  if (taken) throw new TeamError('Someone already has an account with that email.', 409);
  if (input.phone) {
    const phoneTaken = (await db.select().from(users).where(samePhone(input.phone) ?? eq(users.phone, input.phone)).limit(1))[0];
    if (phoneTaken) throw new TeamError('Someone already has an account with that phone number.', 409);
  }
  if (input.crewId) await requireTeam(tenantId, input.crewId);

  const id = crypto.randomUUID();
  await db.insert(users).values({
    id,
    tenantId,
    role: 'CLEANER',
    staffRole: input.staffRole,
    name: input.name,
    email,
    phone: input.phone ? normalizePhone(input.phone) : input.phone || null,
    payType: input.payType ?? 'HOURLY',
    payRateCentsPerHour: input.payRateCentsPerHour ?? null,
    payRateCentsPerClean: input.payRateCentsPerClean ?? null,
    payRateCentsPerDay: input.payRateCentsPerDay ?? null,
    ...(input.locale ? { locale: input.locale } : {}),
  });
  if (input.crewId) await db.insert(crewMembers).values({ id: crypto.randomUUID(), crewId: input.crewId, userId: id });

  try {
    const token = await issuePasswordSetupToken(id);
    const { subject, html } = passwordSetupEmail({ name: input.name, url: appUrl(`/set-password?token=${token}`), locale: input.locale });
    await sendEmail({ to: email, subject, html });
  } catch (err) {
    console.error('[team] invite email failed for', id, err);
  }
  return id;
}

// ---------------------------------------------------------------------------
// Who's on a job
// ---------------------------------------------------------------------------

type JobRef = { id: string; crewId: string };

/** User ids working each job: the team's members, with the job's swaps applied. */
export async function staffForJobs(jobRows: JobRef[]): Promise<Record<string, string[]>> {
  if (jobRows.length === 0) return {};
  const crewIds = [...new Set(jobRows.map((j) => j.crewId))];
  const [members, swaps] = await Promise.all([
    db.select().from(crewMembers).where(inArray(crewMembers.crewId, crewIds)),
    db.select().from(jobStaff).where(inArray(jobStaff.jobId, jobRows.map((j) => j.id))),
  ]);
  return Object.fromEntries(
    jobRows.map((job) => {
      const mine = swaps.filter((s) => s.jobId === job.id);
      const removed = new Set(mine.filter((s) => s.action === 'REMOVE').map((s) => s.userId));
      const ids = members.filter((m) => m.crewId === job.crewId && !removed.has(m.userId)).map((m) => m.userId);
      for (const s of mine) if (s.action === 'ADD' && !ids.includes(s.userId)) ids.push(s.userId);
      return [job.id, ids];
    }),
  );
}

export async function staffForJob(job: JobRef) {
  return (await staffForJobs([job]))[job.id] ?? [];
}

/**
 * Set exactly who works one job. Stored as the difference from the team,
 * so later changes to the team still flow through for everyone not
 * individually swapped.
 */
export async function setJobStaff(tenantId: string, jobId: string, userIds: string[]) {
  const job = (await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1))[0];
  if (!job) throw new TeamError('Job not found', 404);
  await requireTeam(tenantId, job.crewId);
  if (job.status === 'COMPLETE') throw new TeamError('This job is already finished.', 409);
  const wanted = new Set(userIds);
  for (const id of wanted) await requireEmployee(tenantId, id);

  const teamIds = new Set(
    (await db.select().from(crewMembers).where(eq(crewMembers.crewId, job.crewId))).map((m) => m.userId),
  );
  const rows = [
    ...[...wanted].filter((id) => !teamIds.has(id)).map((userId) => ({ userId, action: 'ADD' as const })),
    ...[...teamIds].filter((id) => !wanted.has(id)).map((userId) => ({ userId, action: 'REMOVE' as const })),
  ];
  await db.transaction(async (tx) => {
    await tx.delete(jobStaff).where(eq(jobStaff.jobId, jobId));
    for (const r of rows) await tx.insert(jobStaff).values({ id: crypto.randomUUID(), jobId, ...r });
  });
}

/** Every job id this employee is on: their team's jobs they weren't taken off, plus any they were added to. */
export async function jobIdsForEmployee(userId: string): Promise<string[]> {
  const membership = (await db.select().from(crewMembers).where(eq(crewMembers.userId, userId)).limit(1))[0];
  const swaps = await db.select().from(jobStaff).where(eq(jobStaff.userId, userId));
  const removed = new Set(swaps.filter((s) => s.action === 'REMOVE').map((s) => s.jobId));
  const teamJobs = membership ? await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.crewId, membership.crewId)) : [];
  const ids = teamJobs.map((j) => j.id).filter((id) => !removed.has(id));
  for (const s of swaps) if (s.action === 'ADD' && !ids.includes(s.jobId)) ids.push(s.jobId);
  return ids;
}

/** Is this cleaner on this job (their team's and not taken off, or added)? */
export async function isOnJob(userId: string, job: JobRef) {
  return (await staffForJob(job)).includes(userId);
}

/**
 * May this cleaner start the trip, mark arrival and finish the job? The
 * Team Lead on it may. If nobody on the job is a Team Lead, anyone on it
 * may — a missing lead must never strand a job.
 */
export async function canLeadJob(userId: string, job: JobRef) {
  const staff = await staffForJob(job);
  if (!staff.includes(userId)) return false;
  const people = await db.select().from(users).where(inArray(users.id, staff));
  const leads = people.filter((p) => p.staffRole === 'TEAM_LEAD').map((p) => p.id);
  return leads.length === 0 || leads.includes(userId);
}
