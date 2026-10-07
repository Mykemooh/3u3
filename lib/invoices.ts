import { invoiceEvent } from '@/lib/events';
import { db } from '@/db/client';
import { invoices, invoiceItems, bookings, users, serviceTypes, addresses, tenants } from '@/db/schema';
import { and, eq, gte, sql } from 'drizzle-orm';
import { formatSlotDateLong } from '@/lib/time';
import { getBookingAddOns } from '@/lib/addons';
import { getStripe, isStripeConfigured } from '@/lib/stripe';
import { appUrl } from '@/lib/url';
import { logChange } from '@/lib/audit';
import { getOwnerEmail } from '@/lib/data';
import { logNotification } from '@/lib/bookings';
import { sendEmail, invoiceEmail, paymentReceivedCustomerEmail, paymentReceivedOwnerEmail, type EmailBrand } from '@/lib/email';
import { pushPaidInvoice } from '@/lib/quickbooks';
import { pushPaidInvoiceToXero } from '@/lib/xero';
import { cardRouting, ConnectError } from '@/lib/connect';
import type Stripe from 'stripe';

/** This tenant's own name/colors/logo for the invoice and payment emails — never 3U3's, once this is a different company's booking. */
export async function brandFor(tenantId: string): Promise<EmailBrand> {
  const tenant = (await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1))[0];
  return {
    name: tenant?.name ?? 'Your cleaning company',
    tagline: tenant?.tagline ?? null,
    primaryColor: tenant?.primaryColor ?? '#2563EB',
    bronzeColor: tenant?.bronzeColor ?? '#1D4ED8',
    logoUrl: tenant?.logoUrl ?? null,
  };
}

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

  const addOns = await getBookingAddOns(booking.id);
  const amountCents = (booking.priceCents ?? 0) + addOns.reduce((sum, a) => sum + a.priceCents, 0);
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
    amountCents: booking.priceCents ?? 0,
    sortOrder: 0,
  });

  // Each add-on the client picked at booking time gets its own line, at
  // the price snapshotted onto bookingAddOns — never re-derived from the
  // catalog, so a later price change never rewrites a past invoice.
  for (let i = 0; i < addOns.length; i += 1) {
    await db.insert(invoiceItems).values({
      id: crypto.randomUUID(),
      invoiceId,
      description: addOns[i].name,
      amountCents: addOns[i].priceCents,
      sortOrder: i + 1,
    });
  }

  await applyClientCredit(invoiceId);
  return invoiceId;
}

/**
 * A client's credit (referral rewards, lib/referrals.ts) comes off their
 * next invoice as a minus line. The decrement is conditional on the
 * balance still being there, so two invoices drafted at once can't both
 * spend the same credit.
 */
export const CREDIT_LINE = 'Referral credit';

export async function applyClientCredit(invoiceId: string) {
  const invoice = (await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1))[0];
  if (!invoice || invoice.status !== 'DRAFT' || invoice.totalCents <= 0) return 0;
  const client = (await db.select().from(users).where(eq(users.id, invoice.clientId)).limit(1))[0];
  if (!client || client.creditCents <= 0) return 0;
  const apply = Math.min(client.creditCents, invoice.totalCents);
  const taken = await db
    .update(users)
    .set({ creditCents: sql`${users.creditCents} - ${apply}` })
    .where(and(eq(users.id, client.id), gte(users.creditCents, apply)))
    .returning({ id: users.id });
  if (!taken.length) return 0;
  await db.insert(invoiceItems).values({
    id: crypto.randomUUID(),
    invoiceId,
    description: CREDIT_LINE,
    amountCents: -apply,
    sortOrder: 99,
    taxable: false,
  });
  await db.update(invoices).set({ totalCents: invoice.totalCents - apply }).where(eq(invoices.id, invoiceId));
  return apply;
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
  const brand = await brandFor(invoice.tenantId);
  return { invoice, items, client, booking, address, service, brand, lines: billableLines(invoice, items, service?.name, booking?.slotStart) };
}

export type InvoiceLine = { id: string; description: string; amountCents: number; synthetic?: boolean };

/**
 * The lines that add up to what the client is charged — the stored items
 * minus any tip line (a tip is shown on its own, never in the total). An
 * invoice saved without items (an import, an older row) or whose items no
 * longer add up to its total still reads correctly: the service becomes the
 * one line, or the difference shows as an adjustment, so the subtotal on
 * the page, the email and the Stripe invoice always match the total.
 */
export function billableLines(
  invoice: { totalCents: number },
  items: { id: string; description: string; amountCents: number; isTip?: boolean | null }[],
  serviceName?: string | null,
  slotStart?: string | null,
): InvoiceLine[] {
  const lines: InvoiceLine[] = items.filter((i) => !i.isTip).map((i) => ({ id: i.id, description: i.description, amountCents: i.amountCents }));
  const sum = lines.reduce((s, i) => s + i.amountCents, 0);
  const gap = invoice.totalCents - sum;
  if (lines.length === 0 && invoice.totalCents !== 0) {
    const label = serviceName ?? 'Cleaning service';
    lines.push({ id: 'service', description: slotStart ? `${label} — ${formatSlotDateLong(slotStart)}` : label, amountCents: invoice.totalCents, synthetic: true });
  } else if (gap !== 0) {
    lines.push({ id: 'adjustment', description: 'Adjustment', amountCents: gap, synthetic: true });
  }
  return lines;
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

  // Minus lines are credits or discounts (a referral credit, a goodwill
  // discount); the total itself can never go below zero.
  const totalCents = items.reduce((sum, i) => sum + Math.round(i.amountCents), 0);
  if (totalCents < 0) throw new InvoiceError('Credits and discounts can’t add up to more than the invoice.');
  // Referral credit already came off the client's balance when it was
  // applied; if an edit removes or shrinks that line, the difference goes
  // back to their balance rather than disappearing.
  const creditOf = (rows: { description: string; amountCents: number }[]) =>
    -rows.filter((r) => r.description === CREDIT_LINE && r.amountCents < 0).reduce((sum, r) => sum + Math.round(r.amountCents), 0);
  const oldItems = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId));
  const returned = creditOf(oldItems) - creditOf(items);
  if (returned > 0) {
    await db.update(users).set({ creditCents: sql`${users.creditCents} + ${returned}` }).where(eq(users.id, invoice.clientId));
  }
  await db.delete(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId));
  for (let i = 0; i < items.length; i += 1) {
    await db.insert(invoiceItems).values({
      id: crypto.randomUUID(),
      invoiceId,
      description: items[i].description,
      amountCents: Math.round(items[i].amountCents),
      sortOrder: i,
      taxable: items[i].amountCents >= 0,
    });
  }
  await db.update(invoices).set({ totalCents }).where(eq(invoices.id, invoiceId));
  return totalCents;
}

/** Reuses a client's Stripe Customer if we already made one; creates and persists one otherwise. */
export async function getOrCreateStripeCustomer(clientId: string): Promise<string> {
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
 * Sends the invoice: creates a real Stripe Invoice, finalizes it to get a
 * Stripe-hosted pay page + PDF, then emails the customer ourselves via
 * Resend (so branding/copy stays consistent with every other email this
 * app sends, rather than also having Stripe's own invoice email go out).
 * Reuses the existing Stripe invoice if this is a re-send, so this never
 * double-creates one.
 *
 * If the client has autopay on (My Account → payment method) and a
 * default payment method on file, the invoice is created with
 * collection_method "charge_automatically" and charged immediately —
 * otherwise collection_method stays "send_invoice" (Stripe never auto-
 * charges anything on file) and the client pays via the emailed link, as
 * before. A declined/failed autopay charge falls back to that same
 * emailed pay link rather than leaving the invoice stuck.
 */
export async function sendInvoice(invoiceId: string): Promise<{ url: string; online: boolean }> {
  const data = await getInvoiceWithItems(invoiceId);
  if (!data) throw new InvoiceError('Invoice not found');
  const { invoice, lines: items, client } = data;

  if (invoice.status === 'PAID') throw new InvoiceError('This invoice is already paid');
  if (invoice.status === 'VOID') throw new InvoiceError('This invoice is void');

  let hostedUrl = invoice.hostedInvoiceUrl;
  let autopayCharged = false;

  // No card payments here yet — Stripe isn't set up on this server, or the
  // company hasn't connected its own Stripe account. The invoice still goes
  // out: the email opens the client's invoice page (which says how to pay),
  // and the owner records the payment when it arrives (recordOfflinePayment).
  const online = !hostedUrl && (await onlinePaymentsReady(invoice.tenantId, invoice.totalCents));
  if (!hostedUrl && !online) {
    if (invoice.status === 'DRAFT') {
      await db.update(invoices).set({ status: 'SENT', sentAt: new Date() }).where(eq(invoices.id, invoiceId));
    }
    const viewUrl = appUrl(`/account/invoices/${invoiceId}`);
    if (client?.email) {
      const { subject, html } = invoiceEmail({
        brand: await brandFor(invoice.tenantId),
        name: client.name,
        totalCents: invoice.totalCents,
        items,
        payUrl: viewUrl,
        viewOnly: true,
        locale: client.locale,
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
    await invoiceEvent('invoice.sent', invoiceId);
    return { url: viewUrl, online: false };
  }

  if (!hostedUrl) {
    const stripe = getStripe();
    const customerId = await getOrCreateStripeCustomer(invoice.clientId);
    const useAutopay = !!client?.autopayEnabled && !!client?.stripeDefaultPaymentMethodId;
    const brand = await brandFor(invoice.tenantId);
    const routing = await cardRouting(invoice.tenantId, invoice.totalCents).catch((e: Error) => {
      throw e instanceof ConnectError ? new InvoiceError(e.message) : e;
    });

    const stripeInvoice = await stripe.invoices.create({
      customer: customerId,
      // Our own number, shown on Stripe's page and PDF. (Not Stripe's `number`
      // field: a retried send would collide with a half-created earlier one.)
      custom_fields: [{ name: 'Invoice', value: invoiceLabel(invoice) }],
      // The hosted page's top-level logo/name is Stripe-account-wide (all
      // tenants currently share one Stripe account) and can't be
      // overridden per invoice — but the footer can, so the actual
      // company name still shows up on the page and the PDF.
      footer: brand.name,
      collection_method: useAutopay ? 'charge_automatically' : 'send_invoice',
      ...(useAutopay
        ? { default_payment_method: client!.stripeDefaultPaymentMethodId! }
        : { days_until_due: 7 }),
      auto_advance: false,
      metadata: { invoiceId },
      // The company's own Stripe account, once connected (lib/connect.ts).
      ...(routing ? { transfer_data: { destination: routing.destination }, on_behalf_of: routing.destination, application_fee_amount: routing.feeCents } : {}),
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

    if (useAutopay) {
      try {
        const paid = await stripe.invoices.pay(finalized.id);
        autopayCharged = true;
        // Confirmed synchronously here rather than waiting on the
        // invoice.paid webhook (which may be delayed, or not configured
        // in every environment) — confirmInvoicePaid is idempotent, so
        // a webhook delivery for the same invoice later is a no-op.
        await confirmInvoicePaid(paid);
      } catch (err) {
        console.warn(`[invoices] autopay charge failed for ${invoiceId}, falling back to the emailed pay link:`, err);
      }
    }

    await db
      .update(invoices)
      .set({
        stripeInvoiceId: finalized.id,
        hostedInvoiceUrl: hostedUrl,
        invoicePdfUrl: finalized.invoice_pdf ?? null,
        status: 'SENT',
        sentAt: new Date(),
        autopayCharged,
      })
      .where(eq(invoices.id, invoiceId));
  } else if (invoice.status === 'DRAFT') {
    await db.update(invoices).set({ status: 'SENT', sentAt: new Date() }).where(eq(invoices.id, invoiceId));
  }

  if (!hostedUrl) throw new InvoiceError('Stripe did not return a payment link for this invoice');

  // When autopay just succeeded, confirmInvoicePaid() above already sent
  // the "payment received" email — sending the "please pay" one too would
  // be confusing.
  if (!autopayCharged && client?.email) {
    const { subject, html } = invoiceEmail({
      brand: await brandFor(invoice.tenantId), // separate call: hostedUrl may already exist (re-send path), skipping the block above that declared `brand`
      name: client.name,
      totalCents: invoice.totalCents,
      items,
      payUrl: hostedUrl,
      locale: client.locale,
    });
    await sendEmail({ to: client.email, subject, html });
  }

  if (!autopayCharged) {
    await logNotification({
      tenantId: invoice.tenantId,
      channel: 'EMAIL',
      recipient: client?.email ?? client?.phone ?? 'customer',
      triggerEvent: 'INVOICE_SENT_CUSTOMER',
      relatedBookingId: invoice.bookingId,
    });
  }
  await invoiceEvent('invoice.sent', invoiceId);

  return { url: hostedUrl, online: true };
}

/** Whether a card payment link can be made for this company right now. */
export async function onlinePaymentsReady(tenantId: string, amountCents: number): Promise<boolean> {
  if (!isStripeConfigured()) return false;
  try {
    await cardRouting(tenantId, amountCents);
    return true;
  } catch (err) {
    if (err instanceof ConnectError) return false;
    throw err;
  }
}

export const OFFLINE_METHODS = ['CASH', 'CHECK', 'BANK_TRANSFER', 'CARD_ELSEWHERE', 'OTHER'] as const;
export type OfflineMethod = (typeof OFFLINE_METHODS)[number];
const METHOD_LABEL: Record<OfflineMethod, string> = {
  CASH: 'cash',
  CHECK: 'check',
  BANK_TRANSFER: 'bank transfer',
  CARD_ELSEWHERE: 'card (outside TRASHCAN)',
  OTHER: 'other',
};

/**
 * The owner got paid some other way — cash, a check, Zelle — and records
 * it, so the invoice reads Paid, the client gets their receipt email, and
 * payroll, reports and accounting sync see it like any other payment.
 */
export async function recordOfflinePayment(
  invoiceId: string,
  tenantId: string,
  method: OfflineMethod,
  actor?: { id: string; name: string },
  note?: string,
) {
  const invoice = (await db.select().from(invoices).where(and(eq(invoices.id, invoiceId), eq(invoices.tenantId, tenantId))).limit(1))[0];
  if (!invoice) throw new InvoiceError('Invoice not found');
  if (invoice.status === 'PAID') throw new InvoiceError('This invoice is already paid');
  if (invoice.status === 'VOID') throw new InvoiceError('This invoice is void');
  const now = new Date();
  await db.update(invoices).set({ status: 'PAID', paidAt: now, sentAt: invoice.sentAt ?? now }).where(eq(invoices.id, invoice.id));
  await logChange({
    tenantId,
    actor: actor ?? null,
    entityType: 'invoice',
    entityId: invoice.id,
    action: 'paid',
    summary: `Payment recorded — ${METHOD_LABEL[method]}${note ? ` (${note.slice(0, 120)})` : ''}`,
  });
  await invoiceEvent('invoice.paid', invoice.id);
  await afterInvoicePaid(invoice.id);
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
  await invoiceEvent('invoice.paid', invoice.id);
  await afterInvoicePaid(invoice.id, receiptUrl);
}

/** Receipts, the owner's alert and accounting sync — however the invoice was paid. */
async function afterInvoicePaid(invoiceId: string, receiptUrl?: string) {
  const invoice = (await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1))[0];
  if (!invoice) return;
  const client = (await db.select().from(users).where(eq(users.id, invoice.clientId)).limit(1))[0];
  const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoice.id));
  const brand = await brandFor(invoice.tenantId);

  if (client?.email) {
    const { subject, html } = paymentReceivedCustomerEmail({
      brand,
      name: client.name,
      totalCents: invoice.totalCents,
      receiptUrl,
      locale: client.locale,
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
      brand,
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

  // Best-effort QuickBooks sync — only does anything once an admin has
  // connected it (Admin → Integrations), and never blocks recording the
  // payment in our own database if it fails.
  try {
    await pushPaidInvoice(invoice.tenantId, invoice.id);
  } catch (err) {
    console.warn(`[invoices] QuickBooks sync failed for ${invoice.id}:`, err);
  }
  // Same for Xero (lib/xero.ts).
  try {
    await pushPaidInvoiceToXero(invoice.tenantId, invoice.id);
  } catch (err) {
    console.warn(`[invoices] Xero sync failed for ${invoice.id}:`, err);
  }
}
