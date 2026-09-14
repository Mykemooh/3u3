import { db } from '@/db/client';
import { bookings, quotes, invoices, jobs, users } from '@/db/schema';
import { eq, inArray } from 'drizzle-orm';

/**
 * The whole lifecycle on one screen: lead → walkthrough → estimate →
 * approved → scheduled → done → invoiced → paid.
 *
 * Deliberately a read-only rollup. Every stage here is derived from records
 * the other screens already own (a quote visit, an estimate, a booking, a
 * job, an invoice) rather than a "stage" column someone has to remember to
 * update — a status field maintained by hand goes stale the first busy
 * week, and then the board lies to you.
 */

export type PipelineStageKey =
  | 'NEW_LEAD'
  | 'NEEDS_ESTIMATE'
  | 'ESTIMATE_SENT'
  | 'APPROVED'
  | 'SCHEDULED'
  | 'WORK_DONE'
  | 'INVOICED'
  | 'PAID';

export type PipelineCard = {
  clientId: string;
  clientName: string;
  clientPhone?: string;
  detail: string;
  amountCents?: number;
  href: string;
  /** Sort key within a column — soonest/oldest first where it matters. */
  sortKey: string;
};

export const PIPELINE_STAGES: { key: PipelineStageKey; label: string; hint: string; accent: string }[] = [
  { key: 'NEW_LEAD', label: 'New lead', hint: 'Walkthrough booked', accent: 'border-t-ink/20' },
  { key: 'NEEDS_ESTIMATE', label: 'Needs estimate', hint: 'Visited — price it', accent: 'border-t-amber-400' },
  { key: 'ESTIMATE_SENT', label: 'Estimate sent', hint: 'Waiting on them', accent: 'border-t-amber-500' },
  { key: 'APPROVED', label: 'Approved', hint: 'Yet to book a clean', accent: 'border-t-gold' },
  { key: 'SCHEDULED', label: 'Scheduled', hint: 'On the calendar', accent: 'border-t-blue-400' },
  { key: 'WORK_DONE', label: 'Work done', hint: 'Invoice it', accent: 'border-t-blue-500' },
  { key: 'INVOICED', label: 'Invoiced', hint: 'Awaiting payment', accent: 'border-t-emerald-400' },
  { key: 'PAID', label: 'Paid', hint: 'Closed out', accent: 'border-t-emerald-600' },
];

function money(cents?: number | null) {
  return cents == null ? undefined : cents;
}

function whenLabel(slot: string) {
  return slot.replace('T', ' ').slice(0, 16);
}

export async function getPipeline(tenantId: string) {
  const [allBookings, allQuotes, allInvoices, customers] = await Promise.all([
    db.select().from(bookings).where(eq(bookings.tenantId, tenantId)),
    db.select().from(quotes).where(eq(quotes.tenantId, tenantId)),
    db.select().from(invoices).where(eq(invoices.tenantId, tenantId)),
    db.select().from(users).where(eq(users.tenantId, tenantId)),
  ]);

  const clients = customers.filter((u) => u.role === 'CUSTOMER');
  const bookingIds = allBookings.map((b) => b.id);
  const allJobs = bookingIds.length ? await db.select().from(jobs).where(inArray(jobs.bookingId, bookingIds)) : [];
  const jobByBooking = Object.fromEntries(allJobs.map((j) => [j.bookingId, j]));

  const cards: Record<PipelineStageKey, PipelineCard[]> = {
    NEW_LEAD: [], NEEDS_ESTIMATE: [], ESTIMATE_SENT: [], APPROVED: [],
    SCHEDULED: [], WORK_DONE: [], INVOICED: [], PAID: [],
  };
  const lost: PipelineCard[] = [];

  for (const client of clients) {
    const base = { clientId: client.id, clientName: client.name, clientPhone: client.phone ?? undefined };

    const theirBookings = allBookings.filter((b) => b.clientId === client.id && b.status !== 'CANCELLED');
    const visits = theirBookings.filter((b) => b.isQuoteVisit);
    const cleans = theirBookings.filter((b) => !b.isQuoteVisit);
    const theirQuotes = allQuotes.filter((q) => q.clientId === client.id);
    const theirInvoices = allInvoices.filter((i) => i.clientId === client.id);

    const latest = <T extends { createdAt: Date }>(rows: T[]) =>
      rows.slice().sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

    // Order here is "what needs doing next", not "how far along are they" —
    // those differ for repeat clients. Someone who paid last month and has
    // a clean booked next week belongs in Scheduled, not parked in Paid;
    // someone with a finished job and no invoice belongs in Work done even
    // though they also have older paid work.
    const paid = theirInvoices.filter((i) => i.status === 'PAID');
    const sentInvoices = theirInvoices.filter((i) => i.status === 'SENT');
    const draftInvoices = theirInvoices.filter((i) => i.status === 'DRAFT');
    const invoicedBookingIds = new Set(theirInvoices.map((i) => i.bookingId));

    if (sentInvoices.length) {
      const inv = latest(sentInvoices);
      cards.INVOICED.push({
        ...base,
        detail: inv.sentAt ? `Sent ${inv.sentAt.toLocaleDateString()}` : 'Awaiting payment',
        amountCents: inv.totalCents,
        href: `/admin/invoices/${inv.id}`,
        sortKey: inv.sentAt?.toISOString() ?? '',
      });
      continue;
    }

    if (draftInvoices.length) {
      const inv = latest(draftInvoices);
      cards.WORK_DONE.push({
        ...base,
        detail: 'Invoice drafted — review and send',
        amountCents: inv.totalCents,
        href: `/admin/invoices/${inv.id}`,
        sortKey: inv.createdAt.toISOString(),
      });
      continue;
    }

    // A finished clean that was never invoiced at all — the easiest kind of
    // money to leave on the table, so it outranks everything below it.
    const uninvoicedDone = cleans.filter(
      (b) =>
        (b.status === 'COMPLETED' || jobByBooking[b.id]?.status === 'COMPLETE') &&
        !invoicedBookingIds.has(b.id),
    );
    if (uninvoicedDone.length) {
      const last = uninvoicedDone.slice().sort((a, b) => b.slotStart.localeCompare(a.slotStart))[0];
      cards.WORK_DONE.push({
        ...base,
        detail: `Cleaned ${whenLabel(last.slotStart)} — no invoice yet`,
        amountCents: money(last.priceCents),
        href: '/admin/bookings',
        sortKey: last.slotStart,
      });
      continue;
    }

    const liveCleans = cleans.filter(
      (b) => b.status === 'CONFIRMED' && jobByBooking[b.id]?.status !== 'COMPLETE',
    );
    if (liveCleans.length) {
      const next = liveCleans.slice().sort((a, b) => a.slotStart.localeCompare(b.slotStart))[0];
      const inProgress = jobByBooking[next.id]?.status === 'IN_PROGRESS';
      cards.SCHEDULED.push({
        ...base,
        detail: inProgress ? `In progress · ${whenLabel(next.slotStart)}` : whenLabel(next.slotStart),
        amountCents: money(next.priceCents),
        href: '/admin/schedule',
        sortKey: next.slotStart,
      });
      continue;
    }

    if (paid.length) {
      const inv = latest(paid);
      cards.PAID.push({
        ...base,
        detail: inv.paidAt ? `Paid ${inv.paidAt.toLocaleDateString()}` : 'Paid',
        amountCents: inv.totalCents,
        href: `/admin/invoices/${inv.id}`,
        sortKey: inv.paidAt?.toISOString() ?? '',
      });
      continue;
    }

    const approved = theirQuotes.filter((q) => q.status === 'APPROVED');
    const sentQuotes = theirQuotes.filter((q) => q.status === 'SENT');
    const draftQuotes = theirQuotes.filter((q) => q.status === 'DRAFT');

    if (approved.length) {
      const q = latest(approved);
      cards.APPROVED.push({
        ...base,
        detail: 'Approved — hasn’t booked a clean yet',
        amountCents: q.totalCents,
        href: `/admin/estimates/${q.id}`,
        sortKey: q.respondedAt?.toISOString() ?? '',
      });
      continue;
    }

    if (sentQuotes.length) {
      const q = latest(sentQuotes);
      const stale = q.sentAt ? Date.now() - q.sentAt.getTime() > 5 * 24 * 60 * 60 * 1000 : false;
      cards.ESTIMATE_SENT.push({
        ...base,
        detail: q.sentAt
          ? `Sent ${q.sentAt.toLocaleDateString()}${stale ? ' · worth a nudge' : ''}`
          : 'Sent',
        amountCents: q.totalCents,
        href: `/admin/estimates/${q.id}`,
        sortKey: q.sentAt?.toISOString() ?? '',
      });
      continue;
    }

    if (draftQuotes.length) {
      const q = latest(draftQuotes);
      cards.NEEDS_ESTIMATE.push({
        ...base,
        detail: 'Draft estimate — finish and send',
        amountCents: q.totalCents > 0 ? q.totalCents : undefined,
        href: `/admin/estimates/${q.id}`,
        sortKey: q.createdAt.toISOString(),
      });
      continue;
    }

    // A walkthrough that already produced an estimate has done its job —
    // the lead's real state is that estimate's state, which every branch
    // above has already had its say on. Without this, a client who declined
    // an estimate would fall back to looking like an open lead forever.
    const visitsWithEstimate = new Set(
      theirQuotes.map((q) => q.quoteVisitBookingId).filter(Boolean) as string[],
    );
    const openLoopVisits = visits.filter((v) => !visitsWithEstimate.has(v.id));

    const visited = openLoopVisits.filter((v) => v.status === 'COMPLETED');
    if (visited.length) {
      const v = visited.slice().sort((a, b) => b.slotStart.localeCompare(a.slotStart))[0];
      cards.NEEDS_ESTIMATE.push({
        ...base,
        detail: `Visited ${whenLabel(v.slotStart)} — no estimate yet`,
        href: '/admin/leads',
        sortKey: v.slotStart,
      });
      continue;
    }

    const openVisits = openLoopVisits.filter((v) => v.status === 'REQUESTED' || v.status === 'CONFIRMED');
    if (openVisits.length) {
      const v = openVisits.slice().sort((a, b) => a.slotStart.localeCompare(b.slotStart))[0];
      cards.NEW_LEAD.push({
        ...base,
        detail: `Walkthrough ${whenLabel(v.slotStart)}`,
        href: '/admin/leads',
        sortKey: v.slotStart,
      });
      continue;
    }

    // Everything they have is a no — a declined or expired estimate and
    // nothing since. Checked last, after open walkthroughs, so a client who
    // said no once and has booked a fresh visit reads as a live lead again
    // rather than staying written off.
    const closedOut = theirQuotes.filter((q) => q.status === 'DECLINED' || q.status === 'EXPIRED');
    if (closedOut.length) {
      const q = latest(closedOut);
      lost.push({
        ...base,
        detail: q.status === 'DECLINED' ? 'Declined the estimate' : 'Estimate expired',
        amountCents: q.totalCents,
        href: `/admin/estimates/${q.id}`,
        sortKey: q.respondedAt?.toISOString() ?? q.createdAt.toISOString(),
      });
    }
    // A client with no visit, no estimate and no booking (e.g. one the
    // admin added by hand) simply isn't in the pipeline yet.
  }

  for (const key of Object.keys(cards) as PipelineStageKey[]) {
    cards[key].sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  }
  lost.sort((a, b) => b.sortKey.localeCompare(a.sortKey));

  return { cards, lost };
}
