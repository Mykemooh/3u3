import Link from 'next/link';
import LogoBadge from '@/components/LogoBadge';
import Footer from '@/components/Footer';
import HeroMedia from '@/components/HeroMedia';
import WelcomeCta from '@/components/WelcomeCta';
import { SERVICES } from '@/lib/services';

// WelcomeCta reads the signed-in session to decide between "Get a quote"
// and "Book now", so this page can't be baked at build time.
export const dynamic = 'force-dynamic';

const HOW_IT_WORKS = [
  {
    title: 'Book a free walkthrough',
    description: 'Tell us a bit about your home and pick a time — takes less than a minute.',
  },
  {
    title: 'We price it at your door',
    description: 'Someone comes out, looks at the actual house, and gives you an exact price. No surprises.',
  },
  {
    title: 'Approve it and book',
    description: 'Say yes and your price is locked in. Book one-time or on a schedule that suits you.',
  },
];

export default function WelcomePage() {
  return (
    <main className="bg-white">
      {/* Hero — white, with the film as a soft backdrop once it exists */}
      <section className="relative overflow-hidden px-6 py-20 md:py-28">
        <HeroMedia />
        <div className="relative flex flex-col items-center text-center">
          <LogoBadge size="lg" />
          <h1 className="mt-8 max-w-xl text-3xl font-bold leading-tight text-ink md:text-5xl">
            A spotless home, booked in minutes.
          </h1>
          <p className="mt-4 max-w-md text-lg text-ink/60">
            Family owned, built in Texas. Serving Katy and the surrounding Houston area.
          </p>
          <Link href="/new" className="btn-primary mt-10 w-full max-w-xs text-base">
            Get a free quote
          </Link>
          <Link href="/services" className="mt-4 text-sm font-semibold text-bronze hover:underline">
            See what we clean
          </Link>
        </div>
      </section>

      {/* Services — each one opens its own page */}
      <section className="section border-t border-ink/5 bg-white">
        <div className="container-narrow">
          <h2 className="text-center text-2xl font-bold text-ink md:text-3xl">What we clean</h2>
          <p className="mx-auto mt-3 max-w-lg text-center text-sm text-ink/60">
            Tap any service to see exactly what the crew does, room by room — and what it doesn't cover.
          </p>

          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {SERVICES.map((service) => (
              <Link
                key={service.slug}
                href={`/services/${service.slug}`}
                className="card group flex flex-col transition hover:border-gold hover:shadow-gold"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-bold text-ink">{service.name}</h3>
                  <span
                    aria-hidden
                    className="shrink-0 text-bronze transition group-hover:translate-x-0.5"
                  >
                    →
                  </span>
                </div>
                <p className="mt-2 text-sm text-bronze">{service.tagline}</p>
                <p className="mt-3 text-xs text-ink/40">
                  {service.cadence} · {service.typicalLength}
                </p>
              </Link>
            ))}
          </div>

          <p className="mt-8 text-center text-sm text-ink/50">
            <Link href="/services" className="font-semibold text-bronze hover:underline">
              Compare all four services →
            </Link>
          </p>
        </div>
      </section>

      {/* Sign in / quote / book — changes depending on who's looking */}
      <section className="section border-t border-ink/5 bg-cream">
        <div className="container-narrow">
          <WelcomeCta />
        </div>
      </section>

      {/* How it works */}
      <section className="section border-t border-ink/5 bg-white">
        <div className="container-narrow">
          <h2 className="text-center text-2xl font-bold text-ink md:text-3xl">How it works</h2>
          <div className="mt-10 grid grid-cols-1 gap-8 md:grid-cols-3">
            {HOW_IT_WORKS.map((step, i) => (
              <div key={step.title} className="flex flex-col items-center text-center">
                <div className="step-dot bg-gold text-ink">{i + 1}</div>
                <h3 className="mt-4 font-semibold text-ink">{step.title}</h3>
                <p className="mt-2 text-sm text-ink/60">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
