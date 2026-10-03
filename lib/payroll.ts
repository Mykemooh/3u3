import { and, eq, inArray, isNotNull, desc, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  jobs, bookings, users, invoices, addresses, serviceTypes, tenants,
  payrollRuns, payrollEntries, payrollEntryJobs, payrollEntryTips,
} from '@/db/schema';
import { staffForJobs } from '@/lib/team';
import { sendEmail } from '@/lib/email';
import { esc } from '@/lib/email';

export class PayrollError extends Error {}

/**
 * Payroll — a real run → review → mark-as-paid workflow an owner can
 * depend on, not just a report to eyeball. This follows how purpose-built
 * cleaning CRMs (ZenMaid, most directly) actually handle this: flexible
 * pay types (hourly / per-job / a flat full-workday rate) computed from
 * real clock-in/out and job data, exported for whichever payroll
 * processor the business already runs it through — Gusto, QuickBooks
 * Payroll, ADP, or by hand. None of those competitors offer a free,
 * direct payroll-processor API either (ZenMaid explicitly doesn't; it
 * exports to QuickBooks and leaves actual processing to Gusto or
 * similar) — becoming a payroll processor ourselves would mean handling
 * tax withholding and filing, which is a different, licensed business.
 *
 * What makes this dependable: once a job is included in a payroll run —
 * reviewed or already paid — payroll_entry_jobs' unique (job, employee)
 * index makes it physically impossible to include that job for that
 * person again, no matter what date range a later run covers. A run's
 * rate and totals are snapshotted into payroll_entries at creation time,
 * so a later rate change never silently rewrites a past, already-paid
 * run.
 */

export type PayType = 'HOURLY' | 'PER_CLEAN' | 'DAY_RATE' | 'PERCENTAGE';

export const PAY_TYPE_LABELS: Record<PayType, string> = {
  HOURLY: 'Hourly (clock in/out)',
  PER_CLEAN: 'Per job (flat rate per clean)',
  DAY_RATE: 'Full workday (flat daily rate)',
  PERCENTAGE: 'Percentage of job price',
};

type Employee = typeof users.$inferSelect;

/** The employee's configured rate — cents for the first three pay types, basis points (1500 = 15.00%) for PERCENTAGE. */
function rateFor(employee: Employee): number | null {
  if (employee.payType === 'HOURLY') return employee.payRateCentsPerHour;
  if (employee.payType === 'PER_CLEAN') return employee.payRateCentsPerClean;
  if (employee.payType === 'PERCENTAGE') return employee.payRatePercentBps;
  return employee.payRateCentsPerDay;
}

export type PayrollSettings = { percentPayBasis: 'BASE_PRICE' | 'INVOICE_TOTAL'; hourlyPayModel: 'ACTUAL_TIME' | 'TARGET_TIME'; tipSplitMethod: 'EVEN' | 'BY_HOURS' };

/** Admin-configurable payroll behavior (Admin → Settings) — see tenants in db/schema.ts for what each controls. */
export async function getPayrollSettings(tenantId: string): Promise<PayrollSettings> {
  const tenant = (await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1))[0];
  return {
    percentPayBasis: tenant?.percentPayBasis ?? 'BASE_PRICE',
    hourlyPayModel: tenant?.hourlyPayModel ?? 'ACTUAL_TIME',
    tipSplitMethod: tenant?.tipSplitMethod ?? 'EVEN',
  };
}

type CompletedJob = {
  job: typeof jobs.$inferSelect;
  booking: typeof bookings.$inferSelect;
  address: typeof addresses.$inferSelect | null;
  service: typeof serviceTypes.$inferSelect | null;
  invoice: typeof invoices.$inferSelect | null;
};

/** Every completed job in [startDateISO, endDateISO] that hasn't already been paid out to anyone. */
async function completedJobsInRange(tenantId: string, startDateISO: string, endDateISO: string): Promise<CompletedJob[]> {
  const rows = await db
    .select({ job: jobs, booking: bookings, address: addresses, service: serviceTypes, invoice: invoices })
    .from(jobs)
    .innerJoin(bookings, eq(jobs.bookingId, bookings.id))
    .leftJoin(addresses, eq(bookings.addressId, addresses.id))
    .leftJoin(serviceTypes, eq(bookings.serviceTypeId, serviceTypes.id))
    .leftJoin(invoices, eq(invoices.bookingId, bookings.id))
    .where(and(eq(bookings.tenantId, tenantId), eq(jobs.status, 'COMPLETE'), isNotNull(jobs.startedAt), isNotNull(jobs.completedAt)));
  return rows.filter((r) => r.booking.slotStart.slice(0, 10) >= startDateISO && r.booking.slotStart.slice(0, 10) <= endDateISO);
}

/** Minutes this job should take: the home's own target (set during the walkthrough) or the service's default duration. */
function targetMinutesFor(r: CompletedJob): number {
  return r.address?.targetCleanMinutes ?? r.service?.defaultDurationMinutes ?? 60;
}

/** The job's price for PERCENTAGE pay — the base cleaning price, or the full invoice (incl. add-ons), per tenant setting. */
function priceBasisFor(r: CompletedJob, basis: PayrollSettings['percentPayBasis']): number {
  if (basis === 'INVOICE_TOTAL' && r.invoice) return r.invoice.totalCents;
  return r.booking.priceCents ?? 0;
}

/** Jobs already counted in some payroll entry, per employee — never double-paid, regardless of date range. */
async function alreadyPaidJobIds(jobIds: string[]): Promise<Set<string>> {
  if (jobIds.length === 0) return new Set();
  const rows = await db.select({ jobId: payrollEntryJobs.jobId, userId: payrollEntryJobs.userId }).from(payrollEntryJobs).where(inArray(payrollEntryJobs.jobId, jobIds));
  return new Set(rows.map((r) => `${r.jobId}:${r.userId}`));
}

export type TipClaim = { invoiceId: string; amountCents: number };

/**
 * Every COMPLETE job with a tip that hasn't been fully paid out yet —
 * independent of any date range, so a tip that arrives after its job's
 * pay period already ran is still caught by the next run, never stuck.
 * invoices.tipPaidOutCents (claimed by createPayrollRun below) is what
 * makes this idempotent: a tip is claimed once, by whichever run gets to
 * it first — a customer tip is taxable wages for the employee (IRS Topic
 * 761), not a gift, so it's reported as its own pay line, never silently
 * folded into hourly/per-clean/day-rate/percentage pay.
 *
 * splitMethod EVEN divides it equally across whoever was staffed on the
 * job; BY_HOURS weights each person's share by their time on that job.
 * Note: today every staffer on a job shares the same single clock-in/out
 * (there's no per-person time tracking yet), so BY_HOURS currently comes
 * out identical to EVEN — the weighting is real and ready to differ the
 * moment per-person job time exists, it just has nothing to differ on yet.
 */
async function unclaimedTipsByEmployee(
  tenantId: string,
  splitMethod: PayrollSettings['tipSplitMethod'],
): Promise<Map<string, { cents: number; claims: TipClaim[] }>> {
  const rows = await db
    .select({ job: jobs, invoice: invoices })
    .from(jobs)
    .innerJoin(bookings, eq(jobs.bookingId, bookings.id))
    .innerJoin(invoices, eq(invoices.bookingId, bookings.id))
    .where(and(eq(bookings.tenantId, tenantId), eq(jobs.status, 'COMPLETE'), isNotNull(jobs.startedAt)));

  const tipped = rows.filter((r) => r.invoice.tipCents > r.invoice.tipPaidOutCents);
  if (tipped.length === 0) return new Map();

  const staffMap = await staffForJobs(tipped.map((r) => ({ id: r.job.id, crewId: r.job.crewId })));
  const result = new Map<string, { cents: number; claims: TipClaim[] }>();
  for (const r of tipped) {
    const staffIds = staffMap[r.job.id] ?? [];
    if (staffIds.length === 0) continue;
    const unclaimed = r.invoice.tipCents - r.invoice.tipPaidOutCents;

    // Every staffer's weight is equal under EVEN, and also under
    // BY_HOURS today (see note above) since there's only one shared
    // clock-in/out per job, not one per person.
    const weights = staffIds.map(() => 1);
    const totalWeight = weights.reduce((s, w) => s + w, 0);
    let distributed = 0;
    staffIds.forEach((uid, i) => {
      const isLast = i === staffIds.length - 1;
      // The last share absorbs the rounding remainder so the sum of
      // shares always equals `unclaimed` exactly, never a cent short.
      const share = isLast ? unclaimed - distributed : Math.floor((unclaimed * weights[i]) / totalWeight);
      distributed += share;
      if (share <= 0) return;
      const entry = result.get(uid) ?? { cents: 0, claims: [] };
      entry.cents += share;
      entry.claims.push({ invoiceId: r.invoice.id, amountCents: share });
      result.set(uid, entry);
    });
  }
  return result;
}

export type PayrollPreviewRow = {
  employeeId: string;
  name: string;
  payType: PayType;
  rateCents: number | null;
  ratePercentBps: number | null;
  hours: number;
  jobCount: number;
  daysWorked: number;
  payCents: number | null;
  tipCents: number;
  tipClaims: TipClaim[];
  jobIds: string[];
};

/**
 * What a new run for this date range would pay each employee, excluding
 * any job already counted in a past run — the preview Admin → Payroll
 * shows before committing to "Create payroll run".
 */
export async function previewPayroll(tenantId: string, startDateISO: string, endDateISO: string): Promise<PayrollPreviewRow[]> {
  const settings = await getPayrollSettings(tenantId);
  const completed = await completedJobsInRange(tenantId, startDateISO, endDateISO);
  const tips = await unclaimedTipsByEmployee(tenantId, settings.tipSplitMethod);
  if (completed.length === 0 && tips.size === 0) return [];

  const staffMap = completed.length ? await staffForJobs(completed.map((r) => ({ id: r.job.id, crewId: r.job.crewId }))) : {};
  const paid = await alreadyPaidJobIds(completed.map((r) => r.job.id));

  const byEmployee = new Map<string, { hours: number; jobCount: number; days: Set<string>; jobIds: string[]; percentBasisCents: number }>();
  for (const r of completed) {
    const staffIds = staffMap[r.job.id] ?? [];
    // Actual clocked time, or the home's target time — an employee whose
    // pay type is HOURLY and whose tenant has opted into TARGET_TIME gets
    // paid for the target, not the clock, so finishing faster never costs
    // them pay. Everyone else's "hours" here is just a reporting figure.
    const durationHours =
      settings.hourlyPayModel === 'TARGET_TIME'
        ? targetMinutesFor(r) / 60
        : (r.job.completedAt!.getTime() - r.job.startedAt!.getTime()) / 3_600_000;
    const perPersonHours = staffIds.length ? durationHours / staffIds.length : 0;
    const basisCents = priceBasisFor(r, settings.percentPayBasis);
    const perPersonBasisCents = staffIds.length ? basisCents / staffIds.length : 0;
    const date = r.booking.slotStart.slice(0, 10);
    for (const uid of staffIds) {
      if (paid.has(`${r.job.id}:${uid}`)) continue; // already in an earlier run
      const entry = byEmployee.get(uid) ?? { hours: 0, jobCount: 0, days: new Set<string>(), jobIds: [], percentBasisCents: 0 };
      entry.hours += perPersonHours;
      entry.jobCount += 1;
      entry.days.add(date);
      entry.jobIds.push(r.job.id);
      entry.percentBasisCents += perPersonBasisCents;
      byEmployee.set(uid, entry);
    }
  }

  // Tips are swept independent of the date range (unclaimedTipsByEmployee
  // above), so an employee can show up here purely for a tip even with
  // zero hours in this period.
  const employeeIds = [...new Set([...byEmployee.keys(), ...tips.keys()])];
  if (employeeIds.length === 0) return [];
  const employees = await db.select().from(users).where(inArray(users.id, employeeIds));

  return employees
    .map((e) => {
      const entry = byEmployee.get(e.id) ?? { hours: 0, jobCount: 0, days: new Set<string>(), jobIds: [], percentBasisCents: 0 };
      const tip = tips.get(e.id) ?? { cents: 0, claims: [] };
      const hours = Math.round(entry.hours * 100) / 100;
      const daysWorked = entry.days.size;
      const rate = rateFor(e);
      const rateCents = e.payType === 'PERCENTAGE' ? null : rate;
      const ratePercentBps = e.payType === 'PERCENTAGE' ? rate : null;
      const payCents =
        rate == null
          ? null
          : e.payType === 'HOURLY'
          ? Math.round(hours * rate)
          : e.payType === 'PER_CLEAN'
          ? entry.jobCount * rate
          : e.payType === 'PERCENTAGE'
          ? Math.round((entry.percentBasisCents * rate) / 10000)
          : daysWorked * rate;
      return {
        employeeId: e.id,
        name: e.name,
        payType: e.payType as PayType,
        rateCents,
        ratePercentBps,
        hours,
        jobCount: entry.jobCount,
        daysWorked,
        payCents,
        tipCents: tip.cents,
        tipClaims: tip.claims,
        jobIds: entry.jobIds,
      };
    })
    .sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name));
}

/**
 * Turns a preview into a persisted, reviewable run. Includes a row the
 * moment it has either real hours/clean/day pay OR a tip to claim — an
 * employee with a tip but no rate configured (or no hours this period)
 * still gets an entry, just with payCents 0, so the tip is never stuck
 * waiting on an unrelated rate being set.
 */
export async function createPayrollRun(tenantId: string, input: { label: string; periodStart: string; periodEnd: string }): Promise<string> {
  const preview = await previewPayroll(tenantId, input.periodStart, input.periodEnd);
  const payable = preview.filter((r) => (r.payCents ?? 0) > 0 || r.tipCents > 0);
  if (payable.length === 0) throw new PayrollError('Nothing to pay for this period — check date range and pay rates.');

  const runId = crypto.randomUUID();
  await db.insert(payrollRuns).values({
    id: runId,
    tenantId,
    label: input.label,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    status: 'OPEN',
  });

  for (const row of payable) {
    const entryId = crypto.randomUUID();
    await db.insert(payrollEntries).values({
      id: entryId,
      payrollRunId: runId,
      userId: row.employeeId,
      payType: row.payType,
      rateCents: row.rateCents ?? 0,
      ratePercentBps: row.ratePercentBps,
      hours: row.hours,
      jobCount: row.jobCount,
      daysWorked: row.daysWorked,
      payCents: row.payCents ?? 0,
      tipCents: row.tipCents,
    });
    for (const jobId of row.jobIds) {
      await db.insert(payrollEntryJobs).values({ id: crypto.randomUUID(), payrollEntryId: entryId, jobId, userId: row.employeeId });
    }
    // Claim each tip atomically (column-relative increment, not a
    // read-then-write) so two runs created back to back can never both
    // claim the same tip money. The payrollEntryTips row is what lets
    // voidPayrollRun give this exact amount back later — without it,
    // voiding a run would have no way to know which invoice(s) this
    // entry's tipCents came from.
    for (const claim of row.tipClaims) {
      await db.insert(payrollEntryTips).values({ id: crypto.randomUUID(), payrollEntryId: entryId, invoiceId: claim.invoiceId, amountCents: claim.amountCents });
      await db
        .update(invoices)
        .set({ tipPaidOutCents: sql`${invoices.tipPaidOutCents} + ${claim.amountCents}` })
        .where(eq(invoices.id, claim.invoiceId));
    }
  }

  return runId;
}

export async function listPayrollRuns(tenantId: string) {
  return db.select().from(payrollRuns).where(eq(payrollRuns.tenantId, tenantId)).orderBy(desc(payrollRuns.periodStart));
}

export type PayrollRunRow = { entry: typeof payrollEntries.$inferSelect; name: string; email: string | null };

export async function getPayrollRun(tenantId: string, runId: string) {
  const run = (await db.select().from(payrollRuns).where(and(eq(payrollRuns.id, runId), eq(payrollRuns.tenantId, tenantId))).limit(1))[0];
  if (!run) return null;
  const entries = await db.select().from(payrollEntries).where(eq(payrollEntries.payrollRunId, runId));
  const employees = entries.length ? await db.select().from(users).where(inArray(users.id, entries.map((e) => e.userId))) : [];
  const rows: PayrollRunRow[] = entries
    .map((e) => ({ entry: e, name: employees.find((u) => u.id === e.userId)?.name ?? 'Former employee', email: employees.find((u) => u.id === e.userId)?.email ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const totalCents = entries.reduce((sum, e) => sum + e.payCents + e.tipCents, 0);
  return { run, rows, totalCents };
}

/** "32.00 hours" / "14 cleans" / "5 days" / "18 cleans at 15.00%" — however this entry's pay type prices it. */
function payEntrySummary(entry: { payType: string; hours: number; jobCount: number; daysWorked: number; ratePercentBps: number | null }): string {
  if (entry.payType === 'HOURLY') return `${entry.hours.toFixed(2)} hours`;
  if (entry.payType === 'PER_CLEAN') return `${entry.jobCount} cleans`;
  if (entry.payType === 'PERCENTAGE') return `${entry.jobCount} cleans at ${((entry.ratePercentBps ?? 0) / 100).toFixed(2)}%`;
  return `${entry.daysWorked} days`;
}

/** Marks a run paid and best-effort emails each employee what they were paid. Idempotent. */
export async function markPayrollRunPaid(tenantId: string, runId: string): Promise<void> {
  const data = await getPayrollRun(tenantId, runId);
  if (!data) throw new PayrollError('Payroll run not found');
  if (data.run.status === 'PAID') return;

  await db.update(payrollRuns).set({ status: 'PAID', paidAt: new Date() }).where(eq(payrollRuns.id, runId));

  for (const row of data.rows) {
    if (!row.email) continue;
    try {
      await sendEmail({
        to: row.email,
        subject: `You were paid for ${data.run.label}`,
        html: `<div style="font-family:sans-serif;color:#0B1F3B;max-width:480px;margin:0 auto;">
          <h2 style="color:#1D4ED8;">3U3 Cleaning</h2>
          <p>Hi ${esc(row.name.split(' ')[0])},</p>
          <p>You were just paid <strong>$${((row.entry.payCents + row.entry.tipCents) / 100).toFixed(2)}</strong> for <strong>${esc(data.run.label)}</strong>
          (${esc(payEntrySummary(row.entry))}${row.entry.tipCents > 0 ? `, including $${(row.entry.tipCents / 100).toFixed(2)} in tips` : ''}).</p>
          <p style="color:#6b6b6b;font-size:13px;">— 3U3 Cleaning</p>
        </div>`,
      });
    } catch (err) {
      console.warn(`[payroll] pay notification failed for ${row.email}:`, err);
    }
  }
}

/** Undoes an OPEN run, releasing its jobs back to the payable pool. Can't undo a PAID one. */
export async function voidPayrollRun(tenantId: string, runId: string): Promise<void> {
  const run = (await db.select().from(payrollRuns).where(and(eq(payrollRuns.id, runId), eq(payrollRuns.tenantId, tenantId))).limit(1))[0];
  if (!run) throw new PayrollError('Payroll run not found');
  if (run.status === 'PAID') throw new PayrollError('A paid run cannot be voided — it already went out.');

  const entries = await db.select({ id: payrollEntries.id }).from(payrollEntries).where(eq(payrollEntries.payrollRunId, runId));
  for (const e of entries) {
    // Give any claimed tip money back to its invoice(s) before losing
    // track of which invoice(s) this entry's tipCents came from.
    const tipClaims = await db.select().from(payrollEntryTips).where(eq(payrollEntryTips.payrollEntryId, e.id));
    for (const claim of tipClaims) {
      await db
        .update(invoices)
        .set({ tipPaidOutCents: sql`${invoices.tipPaidOutCents} - ${claim.amountCents}` })
        .where(eq(invoices.id, claim.invoiceId));
    }
    await db.delete(payrollEntryTips).where(eq(payrollEntryTips.payrollEntryId, e.id));
    await db.delete(payrollEntryJobs).where(eq(payrollEntryJobs.payrollEntryId, e.id));
  }
  await db.delete(payrollEntries).where(eq(payrollEntries.payrollRunId, runId));
  await db.delete(payrollRuns).where(eq(payrollRuns.id, runId));
}

export function payrollRunToCsv(rows: PayrollRunRow[]): string {
  const lines = ['Name,Pay type,Hours,Jobs,Days,Rate,Pay,Tips,Total'];
  for (const r of rows) {
    const rate = r.entry.payType === 'PERCENTAGE' ? `${((r.entry.ratePercentBps ?? 0) / 100).toFixed(2)}%` : (r.entry.rateCents / 100).toFixed(2);
    const pay = (r.entry.payCents / 100).toFixed(2);
    const tips = (r.entry.tipCents / 100).toFixed(2);
    const total = ((r.entry.payCents + r.entry.tipCents) / 100).toFixed(2);
    lines.push(
      [`"${r.name.replace(/"/g, '""')}"`, PAY_TYPE_LABELS[r.entry.payType as PayType], r.entry.hours.toFixed(2), r.entry.jobCount, r.entry.daysWorked, rate, pay, tips, total].join(','),
    );
  }
  return lines.join('\n');
}
