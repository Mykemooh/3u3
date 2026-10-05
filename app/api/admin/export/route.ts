import { NextResponse } from 'next/server';
import { adminSession, forbidden } from '@/lib/adminApi';
import { db } from '@/db/client';
import { users, addresses, invoices, bookings, jobs, serviceTypes, crews } from '@/db/schema';
import { and, eq, gte, lte, inArray } from 'drizzle-orm';
import { toCsv, dollars } from '@/lib/csv';
import { listExpenses } from '@/lib/expenses';
import { roomTimes } from '@/lib/reports';
import { previewPayroll } from '@/lib/payroll';
import { invoiceLabel } from '@/lib/invoices';
import { businessTodayISO } from '@/lib/time';

export const dynamic = 'force-dynamic';

const KINDS = ['clients', 'invoices', 'cleans', 'room-times', 'expenses', 'payroll'] as const;
type Kind = (typeof KINDS)[number];

/** Spreadsheet downloads. Every row is this company's own; nothing crosses tenants. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const kind = url.searchParams.get('kind') as Kind;
  if (!KINDS.includes(kind)) return NextResponse.json({ error: 'Unknown export' }, { status: 400 });
  const admin = await adminSession(kind === 'expenses' ? 'expenses.manage' : kind === 'payroll' ? 'payroll.manage' : 'reports.view');
  if (!admin) return forbidden();
  const today = businessTodayISO();
  const valid = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
  const from = valid(url.searchParams.get('from')) ?? `${today.slice(0, 7)}-01`;
  const to = valid(url.searchParams.get('to')) ?? today;
  const t = admin.tenantId;
  let csv = '';

  if (kind === 'clients') {
    const rows = await db.select().from(users).where(and(eq(users.tenantId, t), eq(users.role, 'CUSTOMER')));
    const addr = rows.length ? await db.select().from(addresses).where(inArray(addresses.userId, rows.map((r) => r.id))) : [];
    csv = toCsv(
      ['Name', 'Email', 'Phone', 'Address', 'City', 'ZIP', 'Active', 'Billing', 'Autopay', 'Credit', 'Texts OK', 'Marketing OK', 'Client since'],
      rows.map((u) => {
        const a = addr.find((x) => x.userId === u.id && x.isPrimary) ?? addr.find((x) => x.userId === u.id);
        return [u.name, u.email, u.phone, a?.line1, a?.city, a?.zip, u.isActive ? 'yes' : 'no', u.billingMode, u.autopayEnabled ? 'yes' : 'no', dollars(u.creditCents), u.smsConsent === false ? 'no' : 'yes', u.marketingOptOut ? 'no' : 'yes', u.createdAt.toISOString().slice(0, 10)];
      }),
    );
  } else if (kind === 'invoices') {
    const rows = await db.select().from(invoices).where(and(eq(invoices.tenantId, t), gte(invoices.createdAt, new Date(`${from}T00:00:00Z`)), lte(invoices.createdAt, new Date(`${to}T23:59:59Z`))));
    const people = rows.length ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, [...new Set(rows.map((r) => r.clientId))])) : [];
    csv = toCsv(
      ['Invoice', 'Client', 'Status', 'Total', 'Tip', 'Created', 'Sent', 'Paid', 'Autopay'],
      rows.map((i) => [invoiceLabel(i), people.find((p) => p.id === i.clientId)?.name, i.status, dollars(i.totalCents), dollars(i.tipCents), i.createdAt.toISOString().slice(0, 10), i.sentAt?.toISOString().slice(0, 10), i.paidAt?.toISOString().slice(0, 10), i.autopayCharged ? 'yes' : 'no']),
    );
  } else if (kind === 'cleans') {
    const rows = await db
      .select({ job: jobs, booking: bookings })
      .from(jobs)
      .innerJoin(bookings, eq(bookings.id, jobs.bookingId))
      .where(and(eq(bookings.tenantId, t), gte(bookings.slotStart, from), lte(bookings.slotStart, `${to}T23:59:59`)));
    const people = rows.length ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, [...new Set(rows.map((r) => r.booking.clientId))])) : [];
    const services = await db.select().from(serviceTypes).where(eq(serviceTypes.tenantId, t));
    const teams = await db.select().from(crews).where(eq(crews.tenantId, t));
    csv = toCsv(
      ['Date', 'Start', 'Client', 'Service', 'Team', 'Status', 'Price', 'Started', 'Finished', 'Minutes'],
      rows
        .sort((a, b) => a.booking.slotStart.localeCompare(b.booking.slotStart))
        .map(({ job, booking }) => [
          booking.slotStart.slice(0, 10),
          booking.slotStart.slice(11, 16),
          people.find((p) => p.id === booking.clientId)?.name,
          services.find((s) => s.id === booking.serviceTypeId)?.name,
          teams.find((c) => c.id === job.crewId)?.name,
          booking.status === 'CANCELLED' ? 'CANCELLED' : job.status,
          dollars(booking.priceCents),
          job.startedAt?.toISOString(),
          job.completedAt?.toISOString(),
          job.startedAt && job.completedAt ? Math.round((job.completedAt.getTime() - job.startedAt.getTime()) / 60000) : '',
        ]),
    );
  } else if (kind === 'room-times') {
    const rows = await roomTimes(t, from, to);
    csv = toCsv(['Room', 'Rooms timed', 'Average minutes', 'Median minutes', 'Fastest', 'Slowest'], rows.map((r) => [r.room, r.rooms, r.averageMinutes, r.medianMinutes, r.fastestMinutes, r.slowestMinutes]));
  } else if (kind === 'expenses') {
    const rows = await listExpenses(t, from, to);
    const teams = await db.select().from(crews).where(eq(crews.tenantId, t));
    csv = toCsv(['Date', 'Category', 'Where', 'Amount', 'Team', 'Note'], rows.map((e) => [e.spentOn, e.category, e.vendor, dollars(e.amountCents), teams.find((c) => c.id === e.crewId)?.name, e.notes]));
  } else if (kind === 'payroll') {
    const rows = await previewPayroll(t, from, to, { includePaid: true });
    csv = toCsv(['Name', 'Pay type', 'Cleans', 'Hours', 'Days', 'Pay', 'Tips waiting'], rows.map((r) => [r.name, r.payType, r.jobCount, r.hours, r.daysWorked, dollars(r.payCents), dollars(r.tipCents)]));
  }

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${kind}-${from}-to-${to}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
