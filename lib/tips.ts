import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { invoices, invoiceItems } from '@/db/schema';
import { getStripe } from '@/lib/stripe';
import { getInvoiceWithItems, invoiceLabel } from '@/lib/invoices';
import { appUrl } from '@/lib/url';
import type Stripe from 'stripe';

export class TipError extends Error {}

/**
 * Tips are paid as their own small Stripe Checkout session rather than
 * added to the invoice itself: by the time a client wants to tip, the
 * real invoice is usually already finalized on Stripe at a fixed amount
 * (lib/invoices.ts sendInvoice), and a finalized Stripe Invoice's total
 * can't just be bumped. Checkout keeps this just as card-number-free —
 * Stripe's own hosted page collects it — without touching the invoice.
 */
export async function createTipCheckoutSession(invoiceId: string, amountCents: number): Promise<{ url: string }> {
  if (amountCents < 100) throw new TipError('Tips start at $1.');
  if (amountCents > 50000) throw new TipError('That amount is too large — please contact us directly.');

  const data = await getInvoiceWithItems(invoiceId);
  if (!data) throw new TipError('Invoice not found');
  const { invoice } = data;

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: { name: `Tip for ${invoiceLabel(invoice)}` },
          unit_amount: amountCents,
        },
        quantity: 1,
      },
    ],
    metadata: { invoiceId, kind: 'TIP' },
    success_url: appUrl(`/account/invoices/${invoiceId}?tip=thanks`),
    cancel_url: appUrl(`/account/invoices/${invoiceId}`),
  });
  if (!session.url) throw new TipError('Stripe did not return a checkout link');
  return { url: session.url };
}

/** Called from the Stripe webhook on checkout.session.completed for a tip session. */
export async function confirmTipPaid(session: Stripe.Checkout.Session) {
  if (session.metadata?.kind !== 'TIP' || !session.metadata.invoiceId) return;
  const invoiceId = session.metadata.invoiceId;
  const amountCents = session.amount_total ?? 0;
  if (amountCents <= 0) return;

  const invoice = (await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1))[0];
  if (!invoice) return;
  // invoices.tipCents is what lib/payroll.ts actually claims tips
  // from — this stays the source of truth and is never derived from
  // the line item below.
  await db.update(invoices).set({ tipCents: invoice.tipCents + amountCents }).where(eq(invoices.id, invoiceId));

  // Shown on the invoice as its own line, same as any other charge —
  // but never taxable, and never added to invoice.totalCents (that
  // stays "what the business charged for the clean"; the tip is the
  // employee's money, not the business's revenue). A client can tip
  // more than once on the same invoice, so this accumulates onto one
  // row rather than adding a new one each time.
  const existingTipItem = (
    await db.select().from(invoiceItems).where(and(eq(invoiceItems.invoiceId, invoiceId), eq(invoiceItems.isTip, true))).limit(1)
  )[0];
  if (existingTipItem) {
    await db.update(invoiceItems).set({ amountCents: existingTipItem.amountCents + amountCents }).where(eq(invoiceItems.id, existingTipItem.id));
  } else {
    await db.insert(invoiceItems).values({
      id: crypto.randomUUID(),
      invoiceId,
      description: 'Tip for the crew',
      amountCents,
      sortOrder: 9999,
      taxable: false,
      isTip: true,
    });
  }
}
