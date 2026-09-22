import Link from 'next/link';
import type { Metadata } from 'next';
import LogoBadge from '@/components/LogoBadge';
import Footer from '@/components/Footer';
import { SERVICES, ADD_ONS } from '@/lib/services';

export const metadata: Metadata = {
  title: 'Cleaning services in Katy & Houston — 3U3 Cleaning',
  description:
    'Standard, deep, move-in/move-out and Airbnb turnover cleaning for homes in Katy and the surrounding Houston area. Exact price confirmed in person, before any work starts.',
};

export default function ServicesIndex() {
  return (
    <div className="bg-white">
      <header className="border-b border-ink/5 px-6 py-5">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Link href="/">
            <LogoBadge />
          </Link>
          <Link href="/new" className="text-sm font-semibold text-bronze hover:underline">
            Get a free quote
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-3xl font-bold text-ink md:text-4xl">What we clean</h1>
        <p className="mt-3 max-w-xl text-ink/60">
          Four services, each with its own checklist the crew works room by room. Whichever fits, the price is
          confirmed in person before any work starts — never estimated from a form.
        </p>

        <div className="mt-10 space-y-4">
          {SERVICES.map((service) => (
            <Link
              key={service.slug}
              href={`/services/${service.slug}`}
              className="card block transition hover:border-gold hover:shadow-gold"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-ink">{service.name}</h2>
                  <p className="mt-1 text-sm text-bronze">{service.tagline}</p>
                  <p className="mt-3 text-sm text-ink/60">{service.summary}</p>
                  <p className="mt-3 text-xs text-ink/40">
                    {service.cadence} · {service.typicalLength}
                  </p>
                </div>
                <span aria-hidden className="mt-1 shrink-0 text-bronze">→</span>
              </div>
            </Link>
          ))}
        </div>

        <section className="mt-12">
          <h2 className="text-xl font-bold text-ink">Add-ons for any service</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {ADD_ONS.map((addon) => (
              <span key={addon} className="pill bg-gold/10 text-bronze">
                {addon}
              </span>
            ))}
          </div>
        </section>

        <section className="mt-12 rounded-2xl border border-ink/10 p-8 text-center">
          <h2 className="text-xl font-bold text-ink">Not sure which one you need?</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-ink/60">
            That's what the walkthrough is for. We'll look at the home, tell you honestly what it needs, and price
            it on the spot.
          </p>
          <Link href="/new" className="btn-primary mt-6 w-full max-w-xs">
            Get a free quote
          </Link>
          <p className="mt-4 text-sm text-ink/50">
            Already a customer?{' '}
            <Link href="/signin" className="font-semibold text-bronze hover:underline">
              Sign in to book
            </Link>
          </p>
        </section>
      </main>

      <Footer />
    </div>
  );
}
