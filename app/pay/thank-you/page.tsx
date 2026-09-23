import Link from 'next/link';
import LogoBadge from '@/components/LogoBadge';

// Stripe redirects here after a successful Payment Link checkout. The
// invoice itself is marked PAID via the Stripe webhook (app/api/stripe/
// webhook), not from this page load — so this is purely a friendly landing
// screen, safe even if the customer closes the tab immediately.
export default function PayThankYouPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-12 text-center">
      <LogoBadge size="sm" />
      <div className="mx-auto mt-8 mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gold/15 text-2xl">
        ✓
      </div>
      <h1 className="text-xl font-bold text-ink mb-2">Payment received — thank you!</h1>
      <p className="max-w-sm text-sm text-slate mb-6">
        A receipt is on its way to your email. We appreciate your business.
      </p>
      <Link href="/" className="btn-secondary">
        Back to home
      </Link>
    </main>
  );
}
