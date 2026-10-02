import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { getStripe, isStripeConfigured } from '@/lib/stripe';

export class PaymentError extends Error {}

/**
 * My Account → "Update payment information". We never see or store a card
 * number ourselves — the client fills in Stripe's own Payment Element,
 * which tokenizes the card directly with Stripe, and all we ever persist
 * is an opaque Stripe PaymentMethod id plus the non-sensitive brand/last4/
 * expiry Stripe returns about it (for display only; see db/schema.ts).
 * That's what keeps this out of PCI scope for 3U3 entirely.
 */

export function publicStripeKey(): string | null {
  return process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || null;
}

export function paymentsConfigured(): boolean {
  return isStripeConfigured() && !!publicStripeKey();
}

/** Reuses a client's Stripe Customer if lib/invoices.ts already made one; creates one otherwise. */
async function getOrCreateStripeCustomer(clientId: string): Promise<string> {
  const client = (await db.select().from(users).where(eq(users.id, clientId)).limit(1))[0];
  if (!client) throw new PaymentError('Client not found');
  if (client.stripeCustomerId) return client.stripeCustomerId;

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    name: client.name,
    email: client.email ?? undefined,
    phone: client.phone ?? undefined,
    metadata: { userId: client.id },
  });
  await db.update(users).set({ stripeCustomerId: customer.id }).where(eq(users.id, client.id));
  return customer.id;
}

/**
 * Starts (or resumes) saving a payment method: a SetupIntent whose
 * client_secret the browser hands to Stripe's Payment Element. usage
 * "off_session" is what allows the resulting PaymentMethod to be charged
 * later without the customer present — exactly what autopay needs.
 */
export async function createPaymentMethodSetupIntent(clientId: string): Promise<{ clientSecret: string }> {
  const stripe = getStripe();
  const customerId = await getOrCreateStripeCustomer(clientId);
  const intent = await stripe.setupIntents.create({
    customer: customerId,
    usage: 'off_session',
    payment_method_types: ['card'],
  });
  if (!intent.client_secret) throw new PaymentError('Stripe did not return a setup secret');
  return { clientSecret: intent.client_secret };
}

export type SavedPaymentMethod = {
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
  autopayEnabled: boolean;
};

/**
 * Called once the browser has confirmed the SetupIntent with Stripe. We
 * re-fetch the SetupIntent (and the PaymentMethod it produced) from Stripe
 * ourselves rather than trusting anything the client reports, set it as
 * the customer's default so a future autopay charge uses it automatically,
 * and persist only the display fields.
 */
export async function savePaymentMethodFromSetupIntent(clientId: string, setupIntentId: string): Promise<SavedPaymentMethod> {
  const stripe = getStripe();
  const intent = await stripe.setupIntents.retrieve(setupIntentId);
  if (intent.status !== 'succeeded') throw new PaymentError('That payment method was not confirmed.');
  const pmId = typeof intent.payment_method === 'string' ? intent.payment_method : intent.payment_method?.id;
  if (!pmId) throw new PaymentError('Stripe did not return a payment method');

  const pm = await stripe.paymentMethods.retrieve(pmId);
  const card = pm.card;
  if (!card) throw new PaymentError('Only cards are supported right now.');

  const customerId = await getOrCreateStripeCustomer(clientId);
  await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: pmId } });

  await db
    .update(users)
    .set({
      stripeDefaultPaymentMethodId: pmId,
      paymentMethodBrand: card.brand,
      paymentMethodLast4: card.last4,
      paymentMethodExpMonth: card.exp_month,
      paymentMethodExpYear: card.exp_year,
    })
    .where(eq(users.id, clientId));

  const client = (await db.select().from(users).where(eq(users.id, clientId)).limit(1))[0];
  return {
    brand: card.brand,
    last4: card.last4,
    expMonth: card.exp_month,
    expYear: card.exp_year,
    autopayEnabled: client?.autopayEnabled ?? false,
  };
}

/** Removes the saved payment method, both on Stripe and here, and turns off autopay. */
export async function removePaymentMethod(clientId: string): Promise<void> {
  const client = (await db.select().from(users).where(eq(users.id, clientId)).limit(1))[0];
  if (!client) throw new PaymentError('Client not found');
  if (client.stripeDefaultPaymentMethodId) {
    try {
      await getStripe().paymentMethods.detach(client.stripeDefaultPaymentMethodId);
    } catch (err) {
      console.warn('[payments] detach failed (continuing to clear our own record):', err);
    }
  }
  await db
    .update(users)
    .set({
      stripeDefaultPaymentMethodId: null,
      paymentMethodBrand: null,
      paymentMethodLast4: null,
      paymentMethodExpMonth: null,
      paymentMethodExpYear: null,
      autopayEnabled: false,
    })
    .where(eq(users.id, clientId));
}

/** Turns autopay on (only once a payment method is on file) or off. */
export async function setAutopay(clientId: string, enabled: boolean): Promise<void> {
  const client = (await db.select().from(users).where(eq(users.id, clientId)).limit(1))[0];
  if (!client) throw new PaymentError('Client not found');
  if (enabled && !client.stripeDefaultPaymentMethodId) {
    throw new PaymentError('Add a payment method before turning on autopay.');
  }
  await db.update(users).set({ autopayEnabled: enabled }).where(eq(users.id, clientId));
}
