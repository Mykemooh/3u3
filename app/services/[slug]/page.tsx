import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import LogoBadge from '@/components/LogoBadge';
import Footer from '@/components/Footer';
import { getService, serviceSlugs, SERVICES, ADD_ONS } from '@/lib/services';

// Static content — pre-rendered at build time, one file per service, which
// is what makes these pages worth anything to a search engine.
export function generateStaticParams() {
  return serviceSlugs().map((slug) => ({ slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const service = getService(params.slug);
  if (!service) return { title: 'Service not found — 3U3 Cleaning' };
  return {
    title: `${service.name} in Katy & Houston — 3U3 Cleaning`,
    description: service.summary.slice(0, 155),
  };
}

export default function ServicePage({ params }: { params: { slug: string } }) {
  const service = getService(params.slug);
  if (!service) notFound();

  const others = SERVICES.filter((s) => s.slug !== service.slug);

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
        <Link href="/services" className="text-sm text-ink/50 hover:text-ink">
          ← All services
        </Link>

        <h1 className="mt-4 text-3xl font-bold text-ink md:text-4xl">{service.name}</h1>
        <p className="mt-2 text-lg text-bronze">{service.tagline}</p>
        <p className="mt-6 text-ink/70">{service.summary}</p>

        <dl className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Fact label="How often" value={service.cadence} />
          <Fact label="How long" value={service.typicalLength} />
          <Fact label="Your price" value="Confirmed in person, before any work starts" />
        </dl>

        <section className="mt-12">
          <h2 className="text-xl font-bold text-ink">Who it's for</h2>
          <ul className="mt-4 space-y-2">
            {service.bestFor.map((item) => (
              <li key={item} className="flex gap-3 text-ink/70">
                <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-12">
          <h2 className="text-xl font-bold text-ink">What's included</h2>
          <p className="mt-2 text-sm text-ink/50">
            The crew works this list room by room, the same way every visit.
          </p>
          <div className="mt-6 space-y-6">
            {service.includes.map((group) => (
              <div key={group.area} className="card">
                <h3 className="font-semibold text-ink">{group.area}</h3>
                <ul className="mt-3 space-y-2">
                  {group.items.map((item) => (
                    <li key={item} className="flex gap-3 text-sm text-ink/70">
                      <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gold/60" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-xl font-bold text-ink">What's not included</h2>
          <p className="mt-2 text-sm text-ink/50">
            Said up front, because finding out at the door helps nobody.
          </p>
          <ul className="mt-4 space-y-2">
            {service.notIncluded.map((item) => (
              <li key={item} className="flex gap-3 text-ink/60">
                <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-ink/20" />
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-12">
          <h2 className="text-xl font-bold text-ink">Add anything you need</h2>
          <p className="mt-2 text-sm text-ink/50">
            Mention these at your walkthrough and we'll price them with the rest.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {ADD_ONS.map((addon) => (
              <span key={addon} className="pill bg-gold/10 text-bronze">
                {addon}
              </span>
            ))}
          </div>
        </section>

        <section className="mt-12 rounded-2xl bg-gold/10 p-6">
          <h2 className="font-bold text-ink">Around here specifically</h2>
          <p className="mt-2 text-ink/70">{service.houstonNote}</p>
        </section>

        <section className="mt-12 rounded-2xl border border-ink/10 p-8 text-center">
          <h2 className="text-xl font-bold text-ink">Want {service.name.toLowerCase()} for your home?</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-ink/60">
            Book a free walkthrough. We'll look at your home, give you an exact price on the spot, and you decide
            from there.
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

        <section className="mt-12">
          <h2 className="text-xl font-bold text-ink">Other services</h2>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {others.map((other) => (
              <Link
                key={other.slug}
                href={`/services/${other.slug}`}
                className="card transition hover:border-gold hover:shadow-gold"
              >
                <p className="font-semibold text-ink">{other.name}</p>
                <p className="mt-1 text-sm text-ink/60">{other.tagline}</p>
              </Link>
            ))}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-ink/[0.03] px-4 py-3">
      <dt className="text-xs font-semibold uppercase tracking-wider text-ink/40">{label}</dt>
      <dd className="mt-1 text-sm text-ink/80">{value}</dd>
    </div>
  );
}
