import Stripe from 'stripe';

// Lazily constructed so importing this module never crashes a route/page
// that doesn't actually need Stripe yet (mirrors lib/email.ts's pattern of
// degrading gracefully when a provider key isn't configured).
let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      'STRIPE_SECRET_KEY is not set — add it in .env.local (or Vercel Environment Variables) before sending invoices.',
    );
  }
  _stripe = new Stripe(key, { apiVersion: '2024-11-20.acacia' as Stripe.LatestApiVersion });
  return _stripe;
}

export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}
