import { NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { confirmInvoicePaid } from '@/lib/invoices';
import { confirmTipPaid } from '@/lib/tips';
import type Stripe from 'stripe';

// Stripe needs the raw request body to verify the signature — never parse
// this as JSON before verifying, or the signature check will fail.
export async function POST(req: Request) {
  const signature = req.headers.get('stripe-signature');
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 400 });
  }

  const rawBody = await req.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error('[stripe webhook] signature verification failed', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    if (event.type === 'invoice.paid') {
      await confirmInvoicePaid(event.data.object as Stripe.Invoice);
    } else if (event.type === 'checkout.session.completed') {
      await confirmTipPaid(event.data.object as Stripe.Checkout.Session);
    }
  } catch (err) {
    // Log and still 200 — Stripe retries on non-2xx, and a bug in our own
    // follow-up processing shouldn't cause Stripe to keep hammering this
    // endpoint indefinitely. The invoice can always be reconciled manually
    // from the Stripe dashboard if something here needs fixing.
    console.error('[stripe webhook] handler error', err);
  }

  return NextResponse.json({ received: true });
}
