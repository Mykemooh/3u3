import { NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';
import { confirmInvoicePaid } from '@/lib/invoices';
import { confirmTipPaid } from '@/lib/tips';
import { confirmPlatformCheckout, syncPlatformSubscriptionStatus } from '@/lib/platform';
import { syncConnectAccount } from '@/lib/connect';
import type Stripe from 'stripe';

// Stripe needs the raw request body to verify the signature — never parse
// this as JSON before verifying, or the signature check will fail.
export async function POST(req: Request) {
  const signature = req.headers.get('stripe-signature');
  // Two endpoints can point here: the platform's own events, and Connect
  // events from companies' accounts (account.updated), each with its own
  // signing secret in Stripe.
  const secrets = [process.env.STRIPE_WEBHOOK_SECRET, process.env.STRIPE_CONNECT_WEBHOOK_SECRET].filter(Boolean) as string[];
  if (!signature || secrets.length === 0) {
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 400 });
  }

  const rawBody = await req.text();
  let event: Stripe.Event | null = null;
  for (const secret of secrets) {
    try {
      event = getStripe().webhooks.constructEvent(rawBody, signature, secret);
      break;
    } catch {
      // try the next secret
    }
  }
  if (!event) {
    console.error('[stripe webhook] signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    if (event.type === 'invoice.paid') {
      await confirmInvoicePaid(event.data.object as Stripe.Invoice);
    } else if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      await confirmTipPaid(session);
      await confirmPlatformCheckout(session);
    } else if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      await syncPlatformSubscriptionStatus(event.data.object as Stripe.Subscription);
    } else if (event.type === 'account.updated') {
      // A company's own Stripe account (lib/connect.ts) finished or changed onboarding.
      await syncConnectAccount(event.data.object as Stripe.Account);
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
