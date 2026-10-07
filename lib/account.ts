import { db } from '@/db/client';
import { bookings, jobs, invoices, jobMedia, serviceTypes, addresses } from '@/db/schema';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { JourneyStep } from '@/components/app/JourneyRail';
import { formatClock } from '@/lib/time';
import { invoiceLabel } from '@/lib/invoices';
import { intlLocale, translator, type Locale } from '@/lib/i18n';
import { accountMessages } from '@/lib/i18n/messages/account';

export type AccountBooking = Awaited<ReturnType<typeof getAccountBookings>>[number];

/**
 * Every cleaning for one client, newest last, with its job, invoice and a
 * cover photo — what the account home and invoices list are built from.
 * Draft invoices are the office's working copy and are never shown to the
 * client until they've been sent.
 */
export async function getAccountBookings(clientId: string) {
  const rows = (await db.select().from(bookings).where(eq(bookings.clientId, clientId))).filter(
    (b) => !b.isQuoteVisit && b.status !== 'CANCELLED',
  );
  if (rows.length === 0) return [];
  const ids = rows.map((b) => b.id);
  const [jobRows, invoiceRows, services, addressRows] = await Promise.all([
    db.select().from(jobs).where(inArray(jobs.bookingId, ids)),
    db.select().from(invoices).where(inArray(invoices.bookingId, ids)),
    db.select().from(serviceTypes),
    db.select().from(addresses).where(eq(addresses.userId, clientId)),
  ]);
  const media = jobRows.length
    ? await db
        .select()
        .from(jobMedia)
        .where(and(inArray(jobMedia.jobId, jobRows.map((j) => j.id)), isNull(jobMedia.deletedAt)))
    : [];

  return rows
    .map((b) => {
      const job = jobRows.find((j) => j.bookingId === b.id) ?? null;
      const invoice = invoiceRows.find((i) => i.bookingId === b.id && i.status !== 'DRAFT' && i.status !== 'VOID') ?? null;
      const jobMediaRows = job ? media.filter((m) => m.jobId === job.id) : [];
      const cover =
        jobMediaRows.find((m) => m.phase === 'AFTER' && m.kind === 'PHOTO')?.url ??
        jobMediaRows.find((m) => m.kind === 'PHOTO')?.url ??
        null;
      const address = addressRows.find((a) => a.id === b.addressId) ?? addressRows[0] ?? null;
      return {
        booking: b,
        job,
        invoice,
        service: services.find((s) => s.id === b.serviceTypeId) ?? null,
        address,
        cover,
        photoCount: jobMediaRows.filter((m) => m.kind === 'PHOTO').length,
        videoCount: jobMediaRows.filter((m) => m.kind === 'VIDEO').length,
      };
    })
    .sort((a, b) => a.booking.slotStart.localeCompare(b.booking.slotStart));
}

/** Booked → Cleaning → Done → Invoiced → Paid, from real records only. */
export function cleaningJourney(row: Pick<AccountBooking, 'job' | 'invoice'>, locale: Locale = 'en'): JourneyStep[] {
  const { job, invoice } = row;
  const t = translator(accountMessages, locale);
  const started = job?.status === 'EN_ROUTE' || job?.status === 'IN_PROGRESS' || job?.status === 'COMPLETE';
  const complete = job?.status === 'COMPLETE';
  const sent = invoice?.status === 'SENT' || invoice?.status === 'PAID';
  const paid = invoice?.status === 'PAID';
  const state = (isDone: boolean, isCurrent: boolean) => (isDone ? 'done' : isCurrent ? 'current' : 'todo') as JourneyStep['state'];
  return [
    { label: t('journeyBooked'), state: 'done' },
    {
      label: t('journeyCleaning'),
      state: state(complete, started),
      detail: job?.status === 'EN_ROUTE' ? t('journeyOnTheWay') : job?.startedAt ? formatClock(job.startedAt, locale) : undefined,
    },
    { label: t('journeyDone'), state: state(complete, false), detail: job?.completedAt ? formatClock(job.completedAt, locale) : undefined },
    { label: t('journeyInvoice'), state: state(sent, complete && !sent) },
    { label: t('journeyPaid'), state: state(paid, sent && !paid) },
  ];
}

export type PendingInvoiceRow = { id: string; label: string; amountCents: number; dateLabel: string };

/** Invoices sent but not yet paid — My Account → Payment. */
export function pendingInvoicesFor(rows: AccountBooking[], locale: Locale = 'en'): PendingInvoiceRow[] {
  return rows
    .filter((r) => r.invoice?.status === 'SENT')
    .map((r) => ({
      id: r.invoice!.id,
      label: invoiceLabel(r.invoice!),
      amountCents: r.invoice!.totalCents + r.invoice!.tipCents,
      dateLabel: (r.invoice!.sentAt ?? r.invoice!.createdAt).toLocaleDateString(intlLocale(locale), { month: 'long', day: 'numeric', year: 'numeric' }),
    }))
    .sort((a, b) => a.dateLabel.localeCompare(b.dateLabel));
}

export type PaidInvoiceRow = { id: string; label: string; amountCents: number; dateLabel: string; receiptUrl: string | null };
export type PaymentMonthGroup = { monthKey: string; monthLabel: string; totalCents: number; invoices: PaidInvoiceRow[] };

/** Paid invoices grouped by the month they were paid, newest month first — My Account → Payment history. */
export function paymentHistoryByMonth(rows: AccountBooking[], locale: Locale = 'en'): PaymentMonthGroup[] {
  const paid = rows.filter((r) => r.invoice?.status === 'PAID' && r.invoice.paidAt);
  const groups = new Map<string, PaymentMonthGroup>();
  for (const r of paid) {
    const invoice = r.invoice!;
    const paidAt = invoice.paidAt!;
    const monthKey = `${paidAt.getFullYear()}-${String(paidAt.getMonth() + 1).padStart(2, '0')}`;
    const monthLabel = paidAt.toLocaleDateString(intlLocale(locale), { month: 'long', year: 'numeric' });
    const group = groups.get(monthKey) ?? { monthKey, monthLabel, totalCents: 0, invoices: [] };
    const amountCents = invoice.totalCents + invoice.tipCents;
    group.totalCents += amountCents;
    group.invoices.push({
      id: invoice.id,
      label: invoiceLabel(invoice),
      amountCents,
      dateLabel: paidAt.toLocaleDateString(intlLocale(locale), { month: 'short', day: 'numeric' }),
      receiptUrl: invoice.receiptUrl,
    });
    groups.set(monthKey, group);
  }
  return [...groups.values()].sort((a, b) => b.monthKey.localeCompare(a.monthKey));
}
