import { db } from '@/db/client';
import { bookings, invoices, jobs, jobChecklistItems, quotes, reviews, serviceTypes, users } from '@/db/schema';
import { and, eq, gte, inArray, isNotNull, lte } from 'drizzle-orm';
import { previewPayroll } from '@/lib/payroll';
import { expenseSummary } from '@/lib/expenses';
import { qualitySummary } from '@/lib/quality';
import { businessLocalToUtc } from '@/lib/time';

/**
 * Cleaning reports (Admin → Reports): money in and out, how long cleans
 * and each room really take, quality, and how leads turn into clients —
 * for any date range. Every number comes from records the app already
 * keeps; nothing here is an estimate except labor for anyone without a
 * pay rate, which is flagged rather than guessed.
 */

export type RangeKey = 'this_month' | 'last_month' | 'last_90' | 'this_year' | 'custom';

export function rangeFor(key: RangeKey, today: string, custom?: { from?: string; to?: string }) {
  const [y, m] = today.split('-').map(Number);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  switch (key) {
    case 'last_month':
      return { from: iso(new Date(Date.UTC(y, m - 2, 1))), to: iso(new Date(Date.UTC(y, m - 1, 0))) };
    case 'last_90':
      return { from: iso(new Date(Date.UTC(y, m - 1, Number(today.slice(8, 10)) - 89))), to: today };
    case 'this_year':
      return { from: `${y}-01-01`, to: today };
    case 'custom': {
      const ok = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
      if (ok(custom?.from) && ok(custom?.to) && custom!.from! <= custom!.to!) return { from: custom!.from!, to: custom!.to! };
      return { from: `${today.slice(0, 7)}-01`, to: today };
    }
    default:
      return { from: `${today.slice(0, 7)}-01`, to: today };
  }
}

/** "Bathroom 2" and "Bathroom" are the same kind of room for averages. */
export const roomKind = (name: string) => name.replace(/\s*\d+$/, '').replace(/\s*\(.*\)$/, '').trim() || name;

const minutesBetween = (a: Date | null, b: Date | null) => (a && b ? (b.getTime() - a.getTime()) / 60000 : null);
const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/** Completed cleans whose visit date falls in the range. */
async function completedCleans(tenantId: string, from: string, to: string) {
  const rows = await db
    .select({ job: jobs, booking: bookings })
    .from(jobs)
    .innerJoin(bookings, eq(bookings.id, jobs.bookingId))
    .where(and(eq(bookings.tenantId, tenantId), eq(jobs.status, 'COMPLETE'), gte(bookings.slotStart, from), lte(bookings.slotStart, `${to}T23:59:59`)));
  return rows;
}

export async function roomTimes(tenantId: string, from: string, to: string) {
  const cleans = await completedCleans(tenantId, from, to);
  if (!cleans.length) return [];
  const items = await db
    .select()
    .from(jobChecklistItems)
    .where(and(inArray(jobChecklistItems.jobId, cleans.map((c) => c.job.id)), isNotNull(jobChecklistItems.startedAt), isNotNull(jobChecklistItems.completedAt)));
  const byKind = new Map<string, number[]>();
  for (const i of items) {
    const mins = minutesBetween(i.startedAt, i.completedAt);
    // A room left "started" overnight isn't a real time.
    if (mins == null || mins <= 0.5 || mins > 240) continue;
    const k = roomKind(i.roomName);
    byKind.set(k, [...(byKind.get(k) ?? []), mins]);
  }
  return Array.from(byKind.entries())
    .map(([room, xs]) => ({
      room,
      rooms: xs.length,
      averageMinutes: Math.round(avg(xs)! * 10) / 10,
      medianMinutes: Math.round(median(xs)! * 10) / 10,
      fastestMinutes: Math.round(Math.min(...xs) * 10) / 10,
      slowestMinutes: Math.round(Math.max(...xs) * 10) / 10,
    }))
    .sort((a, b) => b.averageMinutes - a.averageMinutes);
}

export async function cleaningReport(tenantId: string, from: string, to: string) {
  const fromTs = businessLocalToUtc(`${from}T00:00:00`);
  const toTs = businessLocalToUtc(`${to}T23:59:59`);

  // ---- Money
  const paid = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.tenantId, tenantId), eq(invoices.status, 'PAID'), gte(invoices.paidAt, fromTs), lte(invoices.paidAt, toTs)));
  const billed = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.tenantId, tenantId), isNotNull(invoices.sentAt), gte(invoices.sentAt, fromTs), lte(invoices.sentAt, toTs)));
  const openInvoices = await db.select().from(invoices).where(and(eq(invoices.tenantId, tenantId), eq(invoices.status, 'SENT')));
  const revenueCents = paid.reduce((s, i) => s + i.totalCents, 0);
  const tipsCents = paid.reduce((s, i) => s + i.tipCents, 0);
  const payroll = await previewPayroll(tenantId, from, to, { includePaid: true });
  const laborCents = payroll.reduce((s, r) => s + (r.payCents ?? 0), 0);
  const missingRates = payroll.filter((r) => r.payCents == null && r.jobCount > 0).map((r) => r.name);
  const spend = await expenseSummary(tenantId, from, to);

  // ---- Work
  const cleans = await completedCleans(tenantId, from, to);
  const durations = cleans.map((c) => minutesBetween(c.job.startedAt, c.job.completedAt)).filter((m): m is number => m != null && m > 0 && m < 16 * 60);
  const services = await db.select().from(serviceTypes).where(eq(serviceTypes.tenantId, tenantId));
  const byService = new Map<string, { cleans: number; minutes: number[]; revenue: number }>();
  for (const c of cleans) {
    const name = services.find((s) => s.id === c.booking.serviceTypeId)?.name ?? 'Other';
    const e = byService.get(name) ?? { cleans: 0, minutes: [], revenue: 0 };
    e.cleans += 1;
    e.revenue += c.booking.priceCents ?? 0;
    const m = minutesBetween(c.job.startedAt, c.job.completedAt);
    if (m != null && m > 0 && m < 16 * 60) e.minutes.push(m);
    byService.set(name, e);
  }
  const cancelled = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(and(eq(bookings.tenantId, tenantId), eq(bookings.status, 'CANCELLED'), eq(bookings.isQuoteVisit, false), gte(bookings.slotStart, from), lte(bookings.slotStart, `${to}T23:59:59`)));

  // ---- Quality
  const reviewRows = await db.select().from(reviews).where(and(eq(reviews.tenantId, tenantId), gte(reviews.createdAt, fromTs), lte(reviews.createdAt, toTs)));
  const quality = await qualitySummary(tenantId);

  // ---- Pipeline
  const newClients = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.tenantId, tenantId), eq(users.role, 'CUSTOMER'), gte(users.createdAt, fromTs), lte(users.createdAt, toTs)));
  const walkthroughs = await db
    .select({ id: bookings.id, status: bookings.status })
    .from(bookings)
    .where(and(eq(bookings.tenantId, tenantId), eq(bookings.isQuoteVisit, true), gte(bookings.slotStart, from), lte(bookings.slotStart, `${to}T23:59:59`)));
  const sentQuotes = await db.select().from(quotes).where(and(eq(quotes.tenantId, tenantId), isNotNull(quotes.sentAt), gte(quotes.sentAt, fromTs), lte(quotes.sentAt, toTs)));
  const approved = sentQuotes.filter((q) => q.status === 'APPROVED');
  const decided = sentQuotes.filter((q) => q.status === 'APPROVED' || q.status === 'DECLINED' || q.status === 'EXPIRED');

  return {
    range: { from, to },
    money: {
      revenueCents,
      tipsCents,
      billedCents: billed.reduce((s, i) => s + i.totalCents, 0),
      outstandingCents: openInvoices.reduce((s, i) => s + i.totalCents, 0),
      outstandingCount: openInvoices.length,
      laborCents,
      expensesCents: spend.totalCents,
      profitCents: revenueCents - laborCents - spend.totalCents,
      missingRates,
      expensesByCategory: spend.byCategory,
    },
    work: {
      cleans: cleans.length,
      cancelled: cancelled.length,
      averageMinutes: durations.length ? Math.round(avg(durations)!) : null,
      averageTicketCents: cleans.length ? Math.round(cleans.reduce((s, c) => s + (c.booking.priceCents ?? 0), 0) / cleans.length) : null,
      byService: Array.from(byService.entries())
        .map(([service, e]) => ({ service, cleans: e.cleans, averageMinutes: e.minutes.length ? Math.round(avg(e.minutes)!) : null, revenueCents: e.revenue }))
        .sort((a, b) => b.cleans - a.cleans),
      rooms: await roomTimes(tenantId, from, to),
    },
    team: payroll
      .filter((r) => r.jobCount > 0)
      .map((r) => ({ name: r.name, cleans: r.jobCount, hours: r.hours, payCents: r.payCents }))
      .sort((a, b) => b.cleans - a.cleans),
    quality: {
      reviews: reviewRows.length,
      averageRating: reviewRows.length ? Math.round((reviewRows.reduce((s, r) => s + r.rating, 0) / reviewRows.length) * 10) / 10 : null,
      rooms: quality.rooms,
      openRecleans: quality.openRecleans,
    },
    pipeline: {
      newClients: newClients.length,
      walkthroughs: walkthroughs.filter((w) => w.status !== 'CANCELLED').length,
      quotesSent: sentQuotes.length,
      quotesApproved: approved.length,
      approvedValueCents: approved.reduce((s, q) => s + q.totalCents, 0),
      winRate: decided.length ? Math.round((approved.length / decided.length) * 100) : null,
    },
  };
}

export type CleaningReport = Awaited<ReturnType<typeof cleaningReport>>;
