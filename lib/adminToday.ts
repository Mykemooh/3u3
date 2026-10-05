import { db } from '@/db/client';
import { bookings, jobs, invoices, quotes, users, crews } from '@/db/schema';
import { and, eq, inArray, ne } from 'drizzle-orm';
import { businessNowISO, businessTodayISO } from '@/lib/time';
import { staffForJobs } from '@/lib/team';
import { getPipeline } from '@/lib/pipeline';

/**
 * Everything the Admin portal's landing page shows, in the order a
 * cleaning day runs: today's cleans first, then new bookings, quotes, and
 * money still owed. Each card has a big number, a progress ring, and two or
 * three "needs attention" links straight to the filtered list.
 */

export type StripLink = { label: string; count: number; href: string; hot?: boolean };
export type StripCard = {
  key: 'today' | 'bookings' | 'quotes' | 'unpaid';
  title: string;
  big: string;
  caption: string;
  /** 0–1 for the ring; null hides it. */
  progress: number | null;
  progressLabel?: string;
  href: string;
  links: StripLink[];
};

export type TodayVisit = {
  bookingId: string;
  jobId: string | null;
  clientName: string;
  start: string;
  end: string;
  status: 'PENDING' | 'EN_ROUTE' | 'IN_PROGRESS' | 'COMPLETE' | 'QUOTE_VISIT';
  crewName: string | null;
  staffCount: number;
  late: boolean;
  isQuoteVisit: boolean;
};

const PAST_DUE_DAYS = 14;

export async function getAdminToday(tenantId: string) {
  const now = businessNowISO();
  const today = businessTodayISO();
  const weekAgo = new Date(Date.now() - 7 * 86400000);

  const [allBookings, quoteRows, invoiceRows, clientRows, crewRows, pipeline] = await Promise.all([
    db.select().from(bookings).where(and(eq(bookings.tenantId, tenantId), ne(bookings.status, 'CANCELLED'))),
    db.select().from(quotes).where(eq(quotes.tenantId, tenantId)),
    db.select().from(invoices).where(eq(invoices.tenantId, tenantId)),
    db.select({ id: users.id, name: users.name }).from(users).where(and(eq(users.tenantId, tenantId), eq(users.role, 'CUSTOMER'))),
    db.select().from(crews).where(eq(crews.tenantId, tenantId)),
    getPipeline(tenantId),
  ]);

  const name = new Map(clientRows.map((c) => [c.id, c.name]));
  const crewName = new Map(crewRows.map((c) => [c.id, c.name]));

  // ---- Today's cleans ---------------------------------------------------
  const todays = allBookings.filter((b) => b.slotStart.startsWith(today)).sort((a, b) => a.slotStart.localeCompare(b.slotStart));
  const todaysCleans = todays.filter((b) => !b.isQuoteVisit);
  const jobRows = todaysCleans.length
    ? await db.select().from(jobs).where(inArray(jobs.bookingId, todaysCleans.map((b) => b.id)))
    : [];
  const jobByBooking = new Map(jobRows.map((j) => [j.bookingId, j]));
  const staff = await staffForJobs(jobRows.map((j) => ({ id: j.id, crewId: j.crewId })));

  // Future cleans with nobody on them — the unassigned warning.
  const upcomingCleans = allBookings.filter((b) => !b.isQuoteVisit && b.slotEnd >= now && b.status !== 'COMPLETED');
  const upcomingJobs = upcomingCleans.length
    ? await db.select().from(jobs).where(inArray(jobs.bookingId, upcomingCleans.map((b) => b.id)))
    : [];
  const upcomingStaff = await staffForJobs(upcomingJobs.map((j) => ({ id: j.id, crewId: j.crewId })));
  const unassigned = upcomingJobs.filter((j) => (upcomingStaff[j.id] ?? []).length === 0 && j.status !== 'COMPLETE');
  const unassignedBookings = unassigned
    .map((j) => upcomingCleans.find((b) => b.id === j.bookingId)!)
    .filter(Boolean)
    .sort((a, b) => a.slotStart.localeCompare(b.slotStart));

  const visits: TodayVisit[] = todays.map((b) => {
    const job = jobByBooking.get(b.id);
    const status = b.isQuoteVisit ? 'QUOTE_VISIT' : job?.status ?? 'PENDING';
    return {
      bookingId: b.id,
      jobId: job?.id ?? null,
      clientName: name.get(b.clientId) ?? 'Client',
      start: b.slotStart,
      end: b.slotEnd,
      status,
      crewName: b.crewId ? crewName.get(b.crewId) ?? null : null,
      staffCount: job ? (staff[job.id] ?? []).length : 0,
      late: !b.isQuoteVisit && status === 'PENDING' && b.slotStart < shiftMinutes(now, -15),
      isQuoteVisit: b.isQuoteVisit,
    };
  });

  const done = jobRows.filter((j) => j.status === 'COMPLETE').length;
  const underway = jobRows.filter((j) => j.status === 'EN_ROUTE' || j.status === 'IN_PROGRESS').length;
  const late = visits.filter((v) => v.late).length;
  const todayUnassigned = jobRows.filter((j) => (staff[j.id] ?? []).length === 0 && j.status !== 'COMPLETE').length;

  // ---- New bookings ------------------------------------------------------
  const newThisWeek = allBookings.filter((b) => b.createdAt >= weekAgo);
  const stageCount = (k: keyof typeof pipeline.cards) => pipeline.cards[k]?.length ?? 0;
  const upcomingWalkthroughs = allBookings.filter((b) => b.isQuoteVisit && b.slotEnd >= now).length;
  const outsideArea = allBookings.filter((b) => b.isQuoteVisit && b.outsideServiceArea && b.slotEnd >= now).length;

  // ---- Quotes ------------------------------------------------------------
  const sent = quoteRows.filter((q) => q.status === 'SENT');
  const drafts = quoteRows.filter((q) => q.status === 'DRAFT');
  const decided = quoteRows.filter((q) => q.status === 'APPROVED' || q.status === 'DECLINED');
  const approved = quoteRows.filter((q) => q.status === 'APPROVED');

  // ---- Money owed --------------------------------------------------------
  const unpaid = invoiceRows.filter((i) => i.status === 'SENT');
  const draftInvoices = invoiceRows.filter((i) => i.status === 'DRAFT' && !i.batchId);
  const pastDue = unpaid.filter((i) => i.sentAt && Date.now() - i.sentAt.getTime() > PAST_DUE_DAYS * 86400000);
  const monthStart = today.slice(0, 7);
  const billedThisMonth = invoiceRows.filter((i) => i.status !== 'VOID' && i.sentAt && i.sentAt.toISOString().slice(0, 7) === monthStart);
  const paidThisMonth = billedThisMonth.filter((i) => i.status === 'PAID');
  const owed = unpaid.reduce((s, i) => s + i.totalCents, 0);

  const cards: StripCard[] = [
    {
      key: 'today',
      title: "Today's cleans",
      big: String(todaysCleans.length),
      caption: todaysCleans.length === 0 ? 'Nothing on the calendar today' : `${done} done · ${underway} underway`,
      progress: todaysCleans.length ? done / todaysCleans.length : null,
      progressLabel: todaysCleans.length ? `${done}/${todaysCleans.length}` : undefined,
      href: '/admin/schedule',
      links: [
        { label: 'Running late', count: late, href: '/admin/schedule', hot: late > 0 },
        { label: 'No one assigned', count: todayUnassigned, href: '/admin/schedule', hot: todayUnassigned > 0 },
        { label: 'Quote visits today', count: todays.filter((b) => b.isQuoteVisit).length, href: '/admin/leads' },
      ],
    },
    {
      key: 'bookings',
      title: 'New bookings',
      big: String(newThisWeek.length),
      caption: 'Booked in the last 7 days',
      progress: null,
      href: '/admin/pipeline',
      links: [
        { label: 'Walkthroughs coming up', count: upcomingWalkthroughs, href: '/admin/leads' },
        { label: 'Visited, needs a quote', count: stageCount('NEEDS_ESTIMATE'), href: '/admin/pipeline', hot: stageCount('NEEDS_ESTIMATE') > 0 },
        { label: 'Outside service area', count: outsideArea, href: '/admin/leads', hot: outsideArea > 0 },
      ],
    },
    {
      key: 'quotes',
      title: 'Quotes',
      big: String(sent.length),
      caption: 'Waiting on the client',
      progress: decided.length + sent.length ? approved.length / Math.max(1, decided.length) : null,
      progressLabel: decided.length ? `${Math.round((approved.length / decided.length) * 100)}% won` : undefined,
      href: '/admin/estimates',
      links: [
        { label: 'Drafts to send', count: drafts.length, href: '/admin/estimates', hot: drafts.length > 0 },
        { label: 'Approved, not booked', count: stageCount('APPROVED'), href: '/admin/pipeline', hot: stageCount('APPROVED') > 0 },
      ],
    },
    {
      key: 'unpaid',
      title: 'Unpaid',
      big: `$${Math.round(owed / 100).toLocaleString('en-US')}`,
      caption: `${unpaid.length} invoice${unpaid.length === 1 ? '' : 's'} out`,
      progress: billedThisMonth.length ? paidThisMonth.length / billedThisMonth.length : null,
      progressLabel: billedThisMonth.length ? `${paidThisMonth.length}/${billedThisMonth.length} paid this month` : undefined,
      href: '/admin/invoices',
      links: [
        { label: 'Drafts to review', count: draftInvoices.length, href: '/admin/invoices', hot: draftInvoices.length > 0 },
        { label: `Past due (${PAST_DUE_DAYS}+ days)`, count: pastDue.length, href: '/admin/invoices', hot: pastDue.length > 0 },
      ],
    },
  ];

  return {
    cards,
    visits,
    unassigned: unassignedBookings.slice(0, 8).map((b) => ({
      bookingId: b.id,
      clientName: name.get(b.clientId) ?? 'Client',
      start: b.slotStart,
      end: b.slotEnd,
    })),
    unassignedTotal: unassignedBookings.length,
  };
}

function shiftMinutes(iso: string, minutes: number) {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() + minutes);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}
