import { connectRouting } from '@/lib/connect';
import { and, eq, inArray, lt } from 'drizzle-orm';
import { db } from '@/db/client';
import { monthlyBillingBatches, invoices, users, bookings, serviceTypes } from '@/db/schema';
import { getStripe } from '@/lib/stripe';
import { getOrCreateStripeCustomer, brandFor } from '@/lib/invoices';
import { sendEmail, invoiceEmail, paymentReceivedCustomerEmail } from '@/lib/email';
import { businessTodayISO, formatSlotDateLong } from '@/lib/time';

export class MonthlyBillingError extends Error {}

function monthBounds(dateISO: string): { periodStart: string; periodEnd: string } {
  const [y, m] = dateISO.split('-').map(Number);
  const periodStart = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m, 0).getDate(); // day 0 of next month = last day of this month
  const periodEnd = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { periodStart, periodEnd };
}

/**
 * Called from lib/jobs.ts completeJob() instead of sendInvoice() when the
 * client is on MONTHLY_BATCH billing: the invoice stays a DRAFT (never
 * sent or charged on its own) and its amount is folded into the one
 * batch for the calendar month this cleaning happened in, found or
 * created on first use. A client with multiple cleanings a month (the
 * actual target of this feature — most often biweekly) accumulates them
 * all here until the batch closes.
 */
export async function addInvoiceToMonthlyBatch(input: { invoiceId: string; tenantId: string; clientId: string; cleaningDateISO: string; amountCents: number }): Promise<void> {
  const { periodStart, periodEnd } = monthBounds(input.cleaningDateISO);

  let batch = (
    await db
      .select()
      .from(monthlyBillingBatches)
      .where(and(eq(monthlyBillingBatches.clientId, input.clientId), eq(monthlyBillingBatches.periodStart, periodStart)))
      .limit(1)
  )[0];
  if (!batch) {
    const id = crypto.randomUUID();
    await db.insert(monthlyBillingBatches).values({ id, tenantId: input.tenantId, clientId: input.clientId, periodStart, periodEnd });
    batch = (await db.select().from(monthlyBillingBatches).where(eq(monthlyBillingBatches.id, id)).limit(1))[0]!;
  }
  if (batch.status !== 'OPEN') {
    // The batch for this month already closed (a late-arriving completion
    // for an earlier date, most likely) — never silently reopen a closed
    // batch; let it fall back to being invoiced on its own next month's
    // cycle isn't right either, so just leave it DRAFT, unbatched, for
    // the admin to notice and send manually.
    return;
  }

  await db.update(invoices).set({ batchId: batch.id }).where(eq(invoices.id, input.invoiceId));
  await db.update(monthlyBillingBatches).set({ totalCents: batch.totalCents + input.amountCents }).where(eq(monthlyBillingBatches.id, batch.id));
}

export type MonthlyBatchRow = typeof monthlyBillingBatches.$inferSelect;

export async function getMonthlyBatchesForClient(clientId: string): Promise<MonthlyBatchRow[]> {
  return (await db.select().from(monthlyBillingBatches).where(eq(monthlyBillingBatches.clientId, clientId))).sort((a, b) => b.periodStart.localeCompare(a.periodStart));
}

export async function getMonthlyBatchWithInvoices(batchId: string) {
  const batch = (await db.select().from(monthlyBillingBatches).where(eq(monthlyBillingBatches.id, batchId)).limit(1))[0];
  if (!batch) return null;
  const memberInvoices = await db.select().from(invoices).where(eq(invoices.batchId, batchId));
  const bookingRows = memberInvoices.length ? await db.select().from(bookings).where(inArray(bookings.id, memberInvoices.map((i) => i.bookingId))) : [];
  const rows = memberInvoices
    .map((invoice) => ({ invoice, booking: bookingRows.find((b) => b.id === invoice.bookingId) }))
    .sort((a, b) => (a.booking?.slotStart ?? '').localeCompare(b.booking?.slotStart ?? ''));
  return { batch, rows };
}

/**
 * Daily cron (lib/monthlyBilling.ts closeDueMonthlyBatches, called from
 * app/api/cron/monthly-billing): every OPEN batch whose month has
 * actually ended becomes one real Stripe invoice, charged immediately
 * for an autopay client exactly like sendInvoice() always has for a
 * per-clean one — the only difference is there's one line item per
 * cleaning instead of one invoice per cleaning. Every member invoice's
 * own status/paidAt/receiptUrl is updated to match once the batch is
 * paid, so nothing else that reads a per-booking invoice has to know
 * batching exists at all.
 */
export async function closeDueMonthlyBatches(): Promise<{ closed: number; failed: number }> {
  const today = businessTodayISO();
  const due = await db.select().from(monthlyBillingBatches).where(and(eq(monthlyBillingBatches.status, 'OPEN'), lt(monthlyBillingBatches.periodEnd, today)));

  let closed = 0;
  let failed = 0;
  for (const batch of due) {
    try {
      await closeBatch(batch);
      closed += 1;
    } catch (err) {
      console.error('[monthlyBilling] failed to close batch', batch.id, err);
      await db.update(monthlyBillingBatches).set({ status: 'FAILED' }).where(eq(monthlyBillingBatches.id, batch.id));
      failed += 1;
    }
  }
  return { closed, failed };
}

async function closeBatch(batch: MonthlyBatchRow): Promise<void> {
  const memberInvoices = await db.select().from(invoices).where(eq(invoices.batchId, batch.id));
  if (memberInvoices.length === 0) return; // nothing completed this month — leave it OPEN for a late-arriving cleaning, never invoice an empty batch

  const client = (await db.select().from(users).where(eq(users.id, batch.clientId)).limit(1))[0];
  if (!client) throw new MonthlyBillingError('Client not found');

  const bookingRows = await db.select().from(bookings).where(inArray(bookings.id, memberInvoices.map((i) => i.bookingId)));
  const serviceIds = [...new Set(bookingRows.map((b) => b.serviceTypeId).filter((x): x is string => !!x))];
  const serviceRows = serviceIds.length ? await db.select().from(serviceTypes).where(inArray(serviceTypes.id, serviceIds)) : [];

  const stripe = getStripe();
  const customerId = await getOrCreateStripeCustomer(batch.clientId);
  const useAutopay = !!client.autopayEnabled && !!client.stripeDefaultPaymentMethodId;
  const brand = await brandFor(batch.tenantId);
  const routing = await connectRouting(batch.tenantId, memberInvoices.reduce((sum, i) => sum + i.totalCents, 0));

  const stripeInvoice = await stripe.invoices.create({
    customer: customerId,
    custom_fields: [{ name: 'Statement', value: `${batch.periodStart} to ${batch.periodEnd}` }],
    footer: brand.name,
    collection_method: useAutopay ? 'charge_automatically' : 'send_invoice',
    ...(useAutopay ? { default_payment_method: client.stripeDefaultPaymentMethodId! } : { days_until_due: 7 }),
    auto_advance: false,
    metadata: { batchId: batch.id },
    ...(routing ? { transfer_data: { destination: routing.destination }, on_behalf_of: routing.destination, application_fee_amount: routing.feeCents } : {}),
  });

  const lineItems: { description: string; amountCents: number }[] = [];
  for (const invoice of memberInvoices) {
    const booking = bookingRows.find((b) => b.id === invoice.bookingId);
    const service = booking?.serviceTypeId ? serviceRows.find((s) => s.id === booking.serviceTypeId) : undefined;
    const description = `${service ? service.name : 'Cleaning'} — ${booking ? formatSlotDateLong(booking.slotStart) : ''}`;
    lineItems.push({ description, amountCents: invoice.totalCents });
    await stripe.invoiceItems.create({ customer: customerId, invoice: stripeInvoice.id, amount: invoice.totalCents, currency: 'usd', description });
  }

  const finalized = await stripe.invoices.finalizeInvoice(stripeInvoice.id);
  const hostedUrl = finalized.hosted_invoice_url ?? null;

  let autopayCharged = false;
  let receiptUrl: string | undefined;
  if (useAutopay) {
    try {
      const paid = await stripe.invoices.pay(finalized.id);
      autopayCharged = true;
      const chargeId = typeof paid.charge === 'string' ? paid.charge : paid.charge?.id;
      if (chargeId) {
        const charge = await stripe.charges.retrieve(chargeId);
        receiptUrl = charge.receipt_url ?? undefined;
      }
    } catch (err) {
      console.warn(`[monthlyBilling] autopay charge failed for batch ${batch.id}, falling back to the emailed pay link:`, err);
    }
  }

  await db
    .update(monthlyBillingBatches)
    .set({
      status: autopayCharged ? 'PAID' : 'INVOICED',
      stripeInvoiceId: finalized.id,
      hostedInvoiceUrl: hostedUrl,
      invoicePdfUrl: finalized.invoice_pdf ?? null,
      receiptUrl,
      autopayCharged,
      invoicedAt: new Date(),
      paidAt: autopayCharged ? new Date() : null,
    })
    .where(eq(monthlyBillingBatches.id, batch.id));

  // Every member invoice mirrors the batch's own status — lib/payroll.ts
  // tip-claiming, the account invoice list, and QuickBooks sync all key
  // off a per-booking invoice's own status and never need to know a
  // batch exists.
  for (const invoice of memberInvoices) {
    await db
      .update(invoices)
      .set({
        status: autopayCharged ? 'PAID' : 'SENT',
        stripeInvoiceId: finalized.id,
        hostedInvoiceUrl: hostedUrl,
        invoicePdfUrl: finalized.invoice_pdf ?? null,
        receiptUrl,
        autopayCharged,
        sentAt: new Date(),
        paidAt: autopayCharged ? new Date() : null,
      })
      .where(eq(invoices.id, invoice.id));
  }

  if (!hostedUrl) return;

  const totalCents = sumAmount(memberInvoices);
  if (client.email) {
    if (autopayCharged) {
      const { subject, html } = paymentReceivedCustomerEmail({ brand, name: client.name, totalCents, receiptUrl });
      await sendEmail({ to: client.email, subject, html });
    } else {
      const { subject, html } = invoiceEmail({ brand, name: client.name, totalCents, items: lineItems, payUrl: hostedUrl });
      await sendEmail({ to: client.email, subject, html });
    }
  }
}

function sumAmount(rows: { totalCents: number }[]): number {
  return rows.reduce((sum, r) => sum + r.totalCents, 0);
}
