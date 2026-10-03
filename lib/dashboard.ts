import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { tenants, bookings, invoices, crews, users, addresses, jobs, payrollEntries, payrollEntryJobs } from '@/db/schema';
import { staffForJobs } from '@/lib/team';

export const WIDGET_KEYS = ['revenue_by_team', 'profit_per_clean', 'revenue_by_zip', 'retention', 'portfolio_growth'] as const;
export type WidgetKey = (typeof WIDGET_KEYS)[number];

export const WIDGET_LABELS: Record<WidgetKey, string> = {
  revenue_by_team: 'Revenue by team / cleaner',
  profit_per_clean: 'Profit per clean',
  revenue_by_zip: 'Revenue by zip code',
  retention: 'Client retention',
  portfolio_growth: 'Portfolio growth',
};

export type DashboardSettings = { hiddenWidgets: WidgetKey[]; avgSupplyCostCents: number };

export async function getDashboardSettings(tenantId: string): Promise<DashboardSettings> {
  const tenant = (await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1))[0];
  const hiddenWidgets = (tenant?.dashboardHiddenWidgets ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is WidgetKey => (WIDGET_KEYS as readonly string[]).includes(s));
  return { hiddenWidgets, avgSupplyCostCents: tenant?.avgSupplyCostCentsPerClean ?? 800 };
}

export async function updateDashboardSettings(tenantId: string, patch: { hiddenWidgets?: WidgetKey[]; avgSupplyCostCents?: number }) {
  const set: Record<string, unknown> = {};
  if (patch.hiddenWidgets !== undefined) set.dashboardHiddenWidgets = patch.hiddenWidgets.join(',');
  if (patch.avgSupplyCostCents !== undefined) set.avgSupplyCostCentsPerClean = patch.avgSupplyCostCents;
  if (Object.keys(set).length === 0) return;
  await db.update(tenants).set(set).where(eq(tenants.id, tenantId));
}

/** Paid invoices for completed/confirmed bookings in [startISO, endISO] — the one "real revenue" query every widget below builds on. Tips are never included (invoices.totalCents already excludes them). */
async function paidInvoicesInRange(tenantId: string, startISO: string, endISO: string) {
  const rows = await db
    .select({ invoice: invoices, booking: bookings })
    .from(invoices)
    .innerJoin(bookings, eq(invoices.bookingId, bookings.id))
    .where(and(eq(invoices.tenantId, tenantId), eq(invoices.status, 'PAID')));
  return rows.filter((r) => r.booking.slotStart.slice(0, 10) >= startISO && r.booking.slotStart.slice(0, 10) <= endISO);
}

export type TeamRevenueRow = { crewId: string; crewName: string; revenueCents: number; cleans: number };

export async function getRevenueByTeam(tenantId: string, startISO: string, endISO: string): Promise<TeamRevenueRow[]> {
  const rows = await paidInvoicesInRange(tenantId, startISO, endISO);
  const crewRows = await db.select().from(crews).where(eq(crews.tenantId, tenantId));
  const byCrew = new Map<string, { revenueCents: number; cleans: number }>();
  for (const r of rows) {
    const crewId = r.booking.crewId;
    if (!crewId) continue;
    const entry = byCrew.get(crewId) ?? { revenueCents: 0, cleans: 0 };
    entry.revenueCents += r.invoice.totalCents;
    entry.cleans += 1;
    byCrew.set(crewId, entry);
  }
  return [...byCrew.entries()]
    .map(([crewId, v]) => ({ crewId, crewName: crewRows.find((c) => c.id === crewId)?.name ?? 'Unknown team', ...v }))
    .sort((a, b) => b.revenueCents - a.revenueCents);
}

export type CleanerRevenueRow = { userId: string; name: string; revenueCents: number; cleans: number };

/** Each job's revenue split evenly across whoever was staffed on it (same reasoning tips are split) — an individual-cleaner view of the same revenue getRevenueByTeam totals by team. */
export async function getRevenueByCleaner(tenantId: string, startISO: string, endISO: string): Promise<CleanerRevenueRow[]> {
  const rows = await paidInvoicesInRange(tenantId, startISO, endISO);
  if (rows.length === 0) return [];
  const bookingIds = rows.map((r) => r.booking.id);
  const jobRows = await db.select().from(jobs).where(inArray(jobs.bookingId, bookingIds));
  const staffMap = await staffForJobs(jobRows.map((j) => ({ id: j.id, crewId: j.crewId })));
  const employees = await db.select().from(users).where(eq(users.tenantId, tenantId));

  const byUser = new Map<string, { revenueCents: number; cleans: number }>();
  for (const r of rows) {
    const job = jobRows.find((j) => j.bookingId === r.booking.id);
    const staffIds = job ? staffMap[job.id] ?? [] : [];
    if (staffIds.length === 0) continue;
    const share = Math.floor(r.invoice.totalCents / staffIds.length);
    for (const uid of staffIds) {
      const entry = byUser.get(uid) ?? { revenueCents: 0, cleans: 0 };
      entry.revenueCents += share;
      entry.cleans += 1;
      byUser.set(uid, entry);
    }
  }
  return [...byUser.entries()]
    .map(([userId, v]) => ({ userId, name: employees.find((e) => e.id === userId)?.name ?? 'Former employee', ...v }))
    .sort((a, b) => b.revenueCents - a.revenueCents);
}

export type ProfitPerClean = {
  cleans: number;
  revenuePerCleanCents: number;
  laborCostPerCleanCents: number;
  supplyCostCentsPerClean: number;
  profitPerCleanCents: number;
};

/**
 * An estimate, not precise accounting — clearly labeled as such in the
 * UI. Revenue per clean is a real average (paid invoices ÷ completed
 * jobs in range). Labor cost per clean is also a real average (total
 * payroll pay attributed to jobs in range, via payroll_entry_jobs ÷ the
 * number of those jobs) — but day-rate/hourly pay isn't naturally
 * divisible to one exact job, so this spreads each entry's pay evenly
 * across the jobs it covers rather than claiming per-job precision.
 * Supply cost per clean is the one number with no underlying data at
 * all (no per-job supplies tracking exists) — an admin-set assumption
 * (Admin → Dashboard), not derived.
 */
export async function getProfitPerClean(tenantId: string, startISO: string, endISO: string, supplyCostCentsPerClean: number): Promise<ProfitPerClean> {
  const rows = await paidInvoicesInRange(tenantId, startISO, endISO);
  const cleans = rows.length;
  const revenueCents = rows.reduce((sum, r) => sum + r.invoice.totalCents, 0);
  const revenuePerCleanCents = cleans ? Math.round(revenueCents / cleans) : 0;

  let laborCostCents = 0;
  if (cleans > 0) {
    const bookingIds = rows.map((r) => r.booking.id);
    const jobRows = await db.select({ id: jobs.id }).from(jobs).where(inArray(jobs.bookingId, bookingIds));
    const jobIds = jobRows.map((j) => j.id);
    if (jobIds.length > 0) {
      const links = await db.select().from(payrollEntryJobs).where(inArray(payrollEntryJobs.jobId, jobIds));
      const entryIds = [...new Set(links.map((l) => l.payrollEntryId))];
      const entries = entryIds.length ? await db.select().from(payrollEntries).where(inArray(payrollEntries.id, entryIds)) : [];
      for (const entry of entries) {
        const jobsForThisEntry = links.filter((l) => l.payrollEntryId === entry.id).length;
        if (jobsForThisEntry === 0) continue;
        // This entry's pay, spread evenly across every job it covers —
        // then only the jobs that fall in this range count toward the
        // total (links already filtered to jobIds in range, above).
        const perJobShare = entry.payCents / jobsForThisEntry;
        const jobsInRangeForEntry = links.filter((l) => l.payrollEntryId === entry.id && jobIds.includes(l.jobId)).length;
        laborCostCents += perJobShare * jobsInRangeForEntry;
      }
    }
  }
  const laborCostPerCleanCents = cleans ? Math.round(laborCostCents / cleans) : 0;
  const profitPerCleanCents = revenuePerCleanCents - laborCostPerCleanCents - supplyCostCentsPerClean;

  return { cleans, revenuePerCleanCents, laborCostPerCleanCents, supplyCostCentsPerClean, profitPerCleanCents };
}

export type ZipRevenueRow = { zip: string; revenueCents: number; cleans: number };

export async function getRevenueByZip(tenantId: string, startISO: string, endISO: string): Promise<ZipRevenueRow[]> {
  const rows = await paidInvoicesInRange(tenantId, startISO, endISO);
  if (rows.length === 0) return [];
  const addressIds = [...new Set(rows.map((r) => r.booking.addressId).filter((x): x is string => !!x))];
  const addressRows = addressIds.length ? await db.select().from(addresses).where(inArray(addresses.id, addressIds)) : [];

  const byZip = new Map<string, { revenueCents: number; cleans: number }>();
  for (const r of rows) {
    const address = addressRows.find((a) => a.id === r.booking.addressId);
    const zip = address?.zip ?? 'Unknown';
    const entry = byZip.get(zip) ?? { revenueCents: 0, cleans: 0 };
    entry.revenueCents += r.invoice.totalCents;
    entry.cleans += 1;
    byZip.set(zip, entry);
  }
  return [...byZip.entries()].map(([zip, v]) => ({ zip, ...v })).sort((a, b) => b.revenueCents - a.revenueCents);
}

export type RetentionStats = { totalClients: number; repeatClients: number; retentionRatePct: number };

/** Repeat rate: of everyone who's ever booked (not cancelled), what share have booked more than once. A simple, honest retention proxy — not a cohort/time-windowed churn model. */
export async function getRetention(tenantId: string): Promise<RetentionStats> {
  const rows = await db.select({ clientId: bookings.clientId }).from(bookings).where(and(eq(bookings.tenantId, tenantId), eq(bookings.isQuoteVisit, false)));
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (r.clientId) counts.set(r.clientId, (counts.get(r.clientId) ?? 0) + 1);
  }
  const totalClients = counts.size;
  const repeatClients = [...counts.values()].filter((n) => n >= 2).length;
  return { totalClients, repeatClients, retentionRatePct: totalClients ? Math.round((repeatClients / totalClients) * 1000) / 10 : 0 };
}

export type PortfolioMonth = { month: string; homes: number; revenueCents: number };

/** Homes served and revenue, month by month, for the trailing N months (most recent last). */
export async function getPortfolioGrowth(tenantId: string, months = 12): Promise<PortfolioMonth[]> {
  const now = new Date();
  const monthKeys: string[] = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const startISO = `${monthKeys[0]}-01`;
  const endISO = `${monthKeys[monthKeys.length - 1]}-31`;

  const rows = await paidInvoicesInRange(tenantId, startISO, endISO);
  return monthKeys.map((month) => {
    const inMonth = rows.filter((r) => r.booking.slotStart.slice(0, 7) === month);
    const homes = new Set(inMonth.map((r) => r.booking.addressId).filter(Boolean)).size;
    const revenueCents = inMonth.reduce((sum, r) => sum + r.invoice.totalCents, 0);
    return { month, homes, revenueCents };
  });
}
