import { db } from '@/db/client';
import { invoices, invoiceItems, bookings, users, serviceTypes, addresses } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { formatSlotDateLong } from '@/lib/time';
import { getStripe } from '@/lib/stripe';
import { getOwnerEmail } from '@/lib/data';
import { logNotification } from '@/lib/bookings';
import { sendEmail, invoiceEmail, paymentReceivedCustomerEmail, paymentReceivedOwnerEmail } from '@/lib/email';
import type Stripe from 'stripe';

export class InvoiceError extends Error {}

/**
 * The invoice half of "quote → job → invoice → payment → receipt": called
 * the moment a cleaning job is marked COMPLETE (see
 * app/api/crew/jobs/[jobId]/complete/route.ts). Drafts one line item at the
 * client's already-agreed rate (booking.priceCents) — never fabricated —
 * so the admin reviews/adjusts before anything is sent. Idempotent: a
 * booking that already has an invoice just returns its id.
 */
export async function createDraftInvoiceForBooking(bookingId: string): Promise<string> {
  const existing = (await db.select().from(invoices).where(eq(invoices.bookingId, bookingId)).limit(1))[0];
  if (existing) return existing.id;

  const booking = (await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1))[0];
  if (!booking) throw new InvoiceError('Booking not found');
  if (booking.isQuoteVisit) throw new InvoiceError('Quote visits are never invoiced');

  const service = booking.serviceTypeId
    ? (await db.select().from(serviceTypes).where(eq(serviceTypes.id, booking.serviceTypeId)).limit(1))[0]
    : undefined;

  const amountCents = booking.priceCents ?? 0;
  const invoiceId = crypto.randomUUID();

  // Next sequential number for this business. The unique index on
  // (tenant_id, invoice_number) turns a rare simultaneous draft into a
  // retry rather than a duplicate number.
  for (let attempt = 0; ; attempt += 1) {
    const next = await nextInvoiceNumber(booking.tenantId);
    try {
      await db.insert(invoices).values({
        id: invoiceId,
        tenantId: booking.tenantId,
        bookingId: booking.id,
        clientId: booking.clientId,
        status: 'DRAFT',
        totalCents: amountCents,
        invoiceNumber: next,
      });
      break;
    } catch (err) {
      const again = (await db.select().from(invoices).where(eq(invoices.bookingId, bookingId)).limit(1))[0];
      if (again) return again.id;
      if (attempt >= 2) throw err;
    }
  }

  // The flat per-home rate, dated, so the line reads the way the client
  // remembers the visit: "Standard Cleaning — September 24, 2026".
  await db.insert(invoiceItems).values({
    id: crypto.randomUUID(),
    invoiceId,
    description: `${service ? service.name : 'Cleaning service'} — ${formatSlotDateLong(booking.slotStart)}`,
    amountCents,
    sortOrder: 0,
  });

  return invoiceId;
}

async function nextInvoiceNumber(tenantId: string): Promise<number> {
  const row = (
    await db
      .select({ max: sql<number | null>`max(${invoices.invoiceNumber})` })
      .from(invoices)
      .where(eq(invoices.tenantId, tenantId))
  )[0];
  return Math.max(1000, Number(row?.max ?? 1000)) + 1;
}

/** "INV-1001" — or a short id for any invoice that predates numbering. */
export function invoiceLabel(invoice: { id: string; invoiceNumber: number | null }) {
  return invoice.invoiceNumber ? `INV-${invoice.invoiceNumber}` : `INV-${invoice.id.slice(0, 6).toUpperCase()}`;
}

export async function getInvoiceWithItems(invoiceId: string) {
  const invoice = (await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1))[0];
  if (!invoice) return null;
  const items = (await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId))).sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );
  const client = (await db.select().from(users).where(eq(users.id, invoice.clientId)).limit(1))[0];
  const booking = (await db.select().from(bookings).where(eq(bookings.id, invoice.bookingId)).limit(1))[0];
  const address = booking?.addressId
    ? (await db.select().from(addresses).where(eq(addresses.id, booking.addressId)).limit(1))[0]
    : client
    ? (await db.select().from(addresses).where(eq(addresses.userId, client.id)).limit(1))[0]
    : undefined;
  const service = booking?.serviceTypeId
    ? (await db.select().from(serviceTypes).where(eq(serviceTypes.id, booking.serviceTypeId)).limit(1))[0]
    : undefined;
  return { invoice, items, client, booking, address, service };
}

/** Replaces an invoice's line items wholesale — only while it's still a DRAFT. */
export async function replaceInvoiceItems(
  invoiceId: string,
  items: { description: string; amountCents: number }[],
) {
  const invoice = (await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1))[0];
  if (!invoice) throw new InvoiceError('Invoice not found');
  if (invoice.status !== 'DRAFT') throw new InvoiceError('Only draft invoices can be edited');
  if (items.length === 0) throw new InvoiceError('An invoice needs at least one line item');

  await db.delete(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId));
  for (let i = 0; i < items.length; i += 1) {
    await db.insert(invoiceItems).values({
      id: crypto.randomUUID(),
      invoiceId,
      description: items[i].description,
      amountCents: Math.max(0, Math.round(items[i].amountCents)),
      sortOrder: i,
    });
  }
  const totalCents = items.reduce((sum, i) => sum + Math.max(0, Math.round(i.amountCents)), 0);
  await db.update(invoices).set({ totalCents }).where(eq(invoices.id, invoiceId));
  return totalCents;
}

/** Reuses a client's Stripe Customer if we already made one; creates and persists one otherwise. */
async function getOrCreateStripeCustomer(clientId: string): Promise<string> {
  const client = (await db.select().from(users).where(eq(users.id, clientId)).limit(1))[0];
  if (!client) throw new InvoiceError('Client not found');
  if (client.stripeCustomerId) return client.stripeCustomerId;

  const stripe = getStripe();
  // The service address goes on the Stripe customer so it prints on
  // Stripe's hosted invoice page and PDF, not just on ours.
  const address = (await db.select().from(addresses).where(eq(addresses.userId, client.id)).limit(1))[0];
  const customer = await stripe.customers.create({
    name: client.name,
    email: client.email ?? undefined,
    phone: client.phone ?? undefined,
    address: address
      ? { line1: address.line1, city: address.city, state: address.state, postal_code: address.zip ?? undefined, country: 'US' }
      : undefined,
    metadata: { userId: client.id },
  });
  await db.update(users).set({ stripeCustomerId: customer.id }).where(eq(users.id, client.id));
  return customer.id;
}

/**
 * Sends the invoice: creates a real Stripe Invoice (collection_method
 * "send_invoice", so Stripe never auto-charges anything on file — this is
 * the pay-link flow per product decision), finalizes it to get a
 * Stripe-hosted pay page + PDF, then emails the customer ourselves via
 * Resend (so branding/copy stays consistent with every other email this
 * app sends, rather than also having Stripe's own invoice email go out).
 * Reuses the existing Stripe invoice if this is a re-send, so this never
 * double-creates one.
 */
export async function sendInvoice(invoiceId: string): Promise<{ url: string }> {
  const data = await getInvoiceWithItems(invoiceId);
  if (!data) throw new InvoiceError('Invoice not found');
  const { invoice, items, client } = data;

  if (invoice.status === 'PAID') throw new InvoiceError('This invoice is already paid');
  if (invoice.status === 'VOID') throw new InvoiceError('This invoice is void');

  let hostedUrl = invoice.hostedInvoiceUrl;

  if (!hostedUrl) {
    const stripe = getStripe();
    const customerId = await getOrCreateStripeCustomer(invoice.clientId);

    const stripeInvoice = await stripe.invoices.create({
      customer: customerId,
      // Our own number, shown on Stripe's page and PDF. (Not Stripe's `number`
      // field: a retried send would collide with a half-created earlier one.)
      custom_fields: [{ name: 'Invoice', value: invoiceLabel(invoice) }],
      collection_method: 'send_invoice',
      days_until_due: 7,
      auto_advance: false,
      metadata: { invoiceId },
    });

    for (const item of items) {
      await stripe.invoiceItems.create({
        customer: customerId,
        invoice: stripeInvoice.id,
        amount: item.amountCents,
        currency: 'usd',
        description: item.description,
      });
    }

    const finalized = await stripe.invoices.finalizeInvoice(stripeInvoice.id);
    hostedUrl = finalized.hosted_invoice_url ?? null;

    await db
      .update(invoices)
      .set({
        stripeInvoiceId: finalized.id,
        hostedInvoiceUrl: hostedUrl,
        invoicePdfUrl: finalized.invoice_pdf ?? null,
        status: 'SENT',
        sentAt: new Date(),
      })
      .where(eq(invoices.id, invoiceId));
  } else if (invoice.status === 'DRAFT') {
    await db.update(invoices).set({ status: 'SENT', sentAt: new Date() }).where(eq(invoices.id, invoiceId));
  }

  if (!hostedUrl) throw new InvoiceError('Stripe did not return a payment link for this invoice');

  if (client?.email) {
    const { subject, html } = invoiceEmail({
      name: client.name,
      totalCents: invoice.totalCents,
      items,
      payUrl: hostedUrl,
    });
    await sendEmail({ to: client.email, subject, html });
  }

  await logNotification({
    tenantId: invoice.tenantId,
    channel: 'EMAIL',
    recipient: client?.email ?? client?.phone ?? 'customer',
    triggerEvent: 'INVOICE_SENT_CUSTOMER',
    relatedBookingId: invoice.bookingId,
  });

  return { url: hostedUrl };
}

/**
 * Called from the Stripe webhook on invoice.paid. Looks the invoice up by
 * Stripe's own invoice id, pulls the receipt URL off the resulting charge,
 * and fires the paid-confirmation emails. Idempotent — a duplicate webhook
 * delivery for an already-PAID invoice is a no-op.
 */
export async function confirmInvoicePaid(stripeInvoice: Stripe.Invoice) {
  const invoice = (
    await db.select().from(invoices).where(eq(invoices.stripeInvoiceId, stripeInvoice.id)).limit(1)
  )[0];
  if (!invoice || invoice.status === 'PAID') return;

  const stripe = getStripe();
  let receiptUrl: string | undefined;
  let paymentIntentId: string | undefined;
  const chargeId = typeof stripeInvoice.charge === 'string' ? stripeInvoice.charge : stripeInvoice.charge?.id;
  if (chargeId) {
    const charge = await stripe.charges.retrieve(chargeId);
    receiptUrl = charge.receipt_url ?? undefined;
    paymentIntentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
  }

  await db
    .update(invoices)
    .set({ status: 'PAID', paidAt: new Date(), stripePaymentIntentId: paymentIntentId, receiptUrl })
    .where(eq(invoices.id, invoice.id));

  const client = (await db.select().from(users).where(eq(users.id, invoice.clientId)).limit(1))[0];
  const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoice.id));

  if (client?.email) {
    const { subject, html } = paymentReceivedCustomerEmail({
      name: client.name,
      totalCents: invoice.totalCents,
      receiptUrl,
    });
    await sendEmail({ to: client.email, subject, html });
  }
  await logNotification({
    tenantId: invoice.tenantId,
    channel: 'EMAIL',
    recipient: client?.email ?? client?.phone ?? 'customer',
    triggerEvent: 'PAYMENT_RECEIVED_CUSTOMER',
    relatedBookingId: invoice.bookingId,
  });

  const ownerEmail = await getOwnerEmail(invoice.tenantId);
  if (ownerEmail) {
    const { subject, html } = paymentReceivedOwnerEmail({
      clientName: client?.name ?? 'A client',
      totalCents: invoice.totalCents,
      items,
    });
    await sendEmail({ to: ownerEmail, subject, html });
  }
  await logNotification({
    tenantId: invoice.tenantId,
    channel: 'EMAIL',
    recipient: ownerEmail ?? 'owner',
    triggerEvent: 'PAYMENT_RECEIVED_OWNER_ALERT',
    relatedBookingId: invoice.bookingId,
  });
}
