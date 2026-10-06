import { and, eq, gte, inArray, ne } from 'drizzle-orm';
import { db } from '@/db/client';
import { bookings, crews, invoices, jobs, quotes, tenants, users } from '@/db/schema';
import { businessNowISO, businessTodayISO } from '@/lib/time';
import { staffForJobs } from '@/lib/team';
import { recentActivity } from '@/lib/audit';
import { getWallet } from '@/lib/billing/wallet';
import { bestPlanFor, dollars, effectivePlanKey, monthlyCostCents, PLANS } from '@/lib/billing/plans';

/**
 * The owner's landing page (app/admin/page.tsx), shaped by the TRASHCAN
 * guide §6: four numbers for today, revenue over two weeks, today's route,
 * team performance, recent activity, and TRASHCAN Intelligence — short
 * recommendations computed from the company's own records, each with the
 * fix one tap away. Nothing here is estimated or invented: an empty
 * company sees zeros and an all-clear.
 */

export type Insight = { key: string; tone: 'urgent' | 'money' | 'plan' | 'info'; text: string; action: string; href: string };

const DAY = 86400000;
const ymd = (d: Date) => d.toISOString().slice(0, 10);

export async function getDashboardHome(tenantId: string) {
  const now = businessNowISO();
  const today = businessTodayISO();
  const tomorrow = ymd(new Date(new Date(`${today}T12:00:00Z`).getTime() + DAY));
  const fourteenAgo = new Date(Date.now() - 14 * DAY);
  const thirtyAgo = new Date(Date.now() - 30 * DAY);

  const [tenant, bookingRows, crewRows, invoiceRows, quoteRows, clientRows, wallet, activity] = await Promise.all([
    db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1).then((r) => r[0]),
    db.select().from(bookings).where(and(eq(bookings.tenantId, tenantId), ne(bookings.status, 'CANCELLED'), gte(bookings.slotStart, today))),
    db.select().from(crews).where(eq(crews.tenantId, tenantId)),
    db.select().from(invoices).where(eq(invoices.tenantId, tenantId)),
    db.select().from(quotes).where(eq(quotes.tenantId, tenantId)),
    db.select({ id: users.id, name: users.name }).from(users).where(and(eq(users.tenantId, tenantId), eq(users.role, 'CUSTOMER'))),
    getWallet(tenantId),
    recentActivity(tenantId, { sinceDays: 14, limit: 6 }),
  ]);
  const clientName = new Map(clientRows.map((c) => [c.id, c.name]));
  const crewName = new Map(crewRows.map((c) => [c.id, c.name]));

  // ---- Today ---------------------------------------------------------------
  const todays = bookingRows.filter((b) => b.slotStart.startsWith(today) && !b.isQuoteVisit).sort((a, b) => a.slotStart.localeCompare(b.slotStart));
  const jobRows = todays.length ? await db.select().from(jobs).where(inArray(jobs.bookingId, todays.map((b) => b.id))) : [];
  const jobBy = new Map(jobRows.map((j) => [j.bookingId, j]));
  const staff = await staffForJobs(jobRows.map((j) => ({ id: j.id, crewId: j.crewId })));

  const route = todays.map((b) => {
    const job = jobBy.get(b.id);
    const status = job?.status ?? 'PENDING';
    const overMin = status === 'IN_PROGRESS' && b.slotEnd < now ? Math.round((new Date(now).getTime() - new Date(b.slotEnd).getTime()) / 60000) : 0;
    const late = status === 'PENDING' && b.slotStart < now;
    return {
      bookingId: b.id,
      jobId: job?.id ?? null,
      clientId: b.clientId,
      client: clientName.get(b.clientId) ?? 'Client',
      start: b.slotStart,
      end: b.slotEnd,
      crew: job ? crewName.get(job.crewId) ?? null : b.crewId ? crewName.get(b.crewId) ?? null : null,
      staffCount: job ? (staff[job.id] ?? []).length : 0,
      status: overMin > 0 ? ('OVER' as const) : late ? ('LATE' as const) : (status as 'PENDING' | 'EN_ROUTE' | 'IN_PROGRESS' | 'COMPLETE'),
      overMin,
    };
  });

  const completed = route.filter((r) => r.status === 'COMPLETE').length;
  const issues = route.filter((r) => r.status === 'OVER' || r.status === 'LATE' || (r.staffCount === 0 && r.status !== 'COMPLETE')).length;
  const paidToday = invoiceRows.filter((i) => i.status === 'PAID' && i.paidAt && ymd(i.paidAt) === today);
  const revenueTodayCents = paidToday.reduce((s, i) => s + i.totalCents + (i.tipCents ?? 0), 0);

  // ---- Revenue, last 14 days (money actually collected) --------------------
  const series: { date: string; cents: number }[] = [];
  for (let i = 13; i >= 0; i -= 1) series.push({ date: ymd(new Date(Date.now() - i * DAY)), cents: 0 });
  for (const inv of invoiceRows) {
    if (inv.status !== 'PAID' || !inv.paidAt || inv.paidAt < fourteenAgo) continue;
    const point = series.find((p) => p.date === ymd(inv.paidAt!));
    if (point) point.cents += inv.totalCents;
  }
  const revenue14Cents = series.reduce((s, p) => s + p.cents, 0);

  // ---- Team performance, today ---------------------------------------------
  const team = crewRows.map((c) => {
    const mine = route.filter((r) => jobRows.find((j) => j.bookingId === r.bookingId)?.crewId === c.id);
    const done = mine.filter((r) => r.status === 'COMPLETE').length;
    const over = mine.filter((r) => r.status === 'OVER').length;
    return { id: c.id, name: c.name, jobs: mine.length, done, over, pct: mine.length ? Math.round((done / mine.length) * 100) : 0 };
  }).sort((a, b) => b.jobs - a.jobs);

  // ---- TRASHCAN Intelligence ------------------------------------------------
  const insights: Insight[] = [];
  for (const r of route.filter((x) => x.status === 'OVER').slice(0, 2)) {
    insights.push({ key: `over-${r.bookingId}`, tone: 'urgent', text: `${r.client}’s clean is running ${r.overMin} minutes over estimate.`, action: 'Text the client an update', href: `/admin/messages?new=1&client=${r.clientId}` });
  }
  const lateNow = route.filter((x) => x.status === 'LATE');
  if (lateNow.length) {
    insights.push({ key: 'late', tone: 'urgent', text: `${lateNow.length} clean${lateNow.length === 1 ? ' hasn’t' : 's haven’t'} started on time today.`, action: 'Open today’s schedule', href: '/admin/schedule' });
  }
  const unassignedUpcoming = bookingRows.filter((b) => !b.isQuoteVisit && !b.crewId && b.slotStart >= today).length;
  const unassignedToday = route.filter((r) => r.staffCount === 0 && r.status !== 'COMPLETE').length;
  if (unassignedToday + unassignedUpcoming > 0) {
    const n = Math.max(unassignedToday, unassignedUpcoming);
    insights.push({ key: 'unassigned', tone: 'urgent', text: `${n} upcoming clean${n === 1 ? ' has' : 's have'} nobody assigned.`, action: 'Assign a team', href: '/admin/schedule' });
  }
  const tomorrowsByCrew = new Map<string, number>();
  for (const b of bookingRows.filter((x) => x.slotStart.startsWith(tomorrow) && !x.isQuoteVisit && x.crewId)) {
    tomorrowsByCrew.set(b.crewId!, (tomorrowsByCrew.get(b.crewId!) ?? 0) + 1);
  }
  const idleTomorrow = crewRows.filter((c) => !tomorrowsByCrew.get(c.id));
  if (crewRows.length > 1 && idleTomorrow.length && idleTomorrow.length < crewRows.length) {
    insights.push({ key: 'idle', tone: 'info', text: `${idleTomorrow.map((c) => c.name).join(', ')} ${idleTomorrow.length === 1 ? 'has' : 'have'} nothing booked tomorrow.`, action: 'Fill from the schedule', href: '/admin/schedule' });
  }
  const pastDue = invoiceRows.filter((i) => i.status === 'SENT' && i.sentAt && Date.now() - i.sentAt.getTime() > 14 * DAY);
  if (pastDue.length) {
    const owed = pastDue.reduce((s, i) => s + i.totalCents, 0);
    insights.push({ key: 'pastdue', tone: 'money', text: `${pastDue.length} invoice${pastDue.length === 1 ? ' is' : 's are'} more than 14 days unpaid (${dollars(owed)}).`, action: 'Send reminders', href: '/admin/invoices' });
  }
  const staleQuotes = quoteRows.filter((q) => q.status === 'SENT' && q.sentAt && Date.now() - q.sentAt.getTime() > 3 * DAY);
  if (staleQuotes.length) {
    insights.push({ key: 'quotes', tone: 'money', text: `${staleQuotes.length} quote${staleQuotes.length === 1 ? ' has' : 's have'} waited 3+ days for an answer.`, action: 'Follow up', href: '/admin/estimates' });
  }
  if (tenant && !tenant.billingExempt) {
    if (wallet.textingStatus === 'SUSPENDED' || (wallet.balanceCents === 0 && wallet.includedTextsRemaining === 0 && tenant.smsNumber)) {
      insights.push({ key: 'credits', tone: 'urgent', text: 'Texting is paused — you’re out of credits.', action: 'Add credits', href: '/admin/plan' });
    }
    // Would another plan have been cheaper over the last 30 days?
    const cardVolume = invoiceRows.filter((i) => i.status === 'PAID' && i.paidAt && i.paidAt >= thirtyAgo).reduce((s, i) => s + i.totalCents, 0);
    const current = PLANS[effectivePlanKey(tenant)];
    const best = bestPlanFor(cardVolume);
    const saving = monthlyCostCents(current, cardVolume) - best.costCents;
    if (!tenant.planCompForever && !(tenant.planCompUntil && tenant.planCompUntil > new Date()) && best.plan.key !== current.key && saving >= 1000) {
      insights.push({ key: 'plan', tone: 'plan', text: `${best.plan.name} would have saved you ${dollars(saving)} over the last 30 days.`, action: `Compare plans`, href: '/admin/plan' });
    }
  }

  return {
    metrics: {
      jobsToday: route.length,
      completed,
      issues,
      revenueTodayCents,
    },
    route,
    series,
    revenue14Cents,
    team,
    insights: insights.slice(0, 5),
    activity: activity.map((a) => ({ id: a.id, who: a.actorName ?? 'Someone', summary: a.summary, at: a.createdAt.toISOString() })),
  };
}
