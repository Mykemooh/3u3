import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { invoices } from '@/db/schema';
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
  await db.update(invoices).set({ tipCents: invoice.tipCents + amountCents }).where(eq(invoices.id, invoiceId));
}
