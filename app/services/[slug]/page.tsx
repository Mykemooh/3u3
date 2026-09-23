import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import SiteHeader from '@/components/SiteHeader';
import Footer from '@/components/Footer';
import { getService, SERVICES, ADD_ONS } from '@/lib/services';

// The header reads the signed-in session to show "Book now" instead of
// "Get a free quote", so these render per request rather than at build time.
// The copy itself is still static and fully crawlable.
export const dynamic = 'force-dynamic';

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
      <SiteHeader />

      <main className="mx-auto max-w-3xl px-6 py-12">
        <Link href="/services" className="meta transition hover:text-ink">
          ← All services
        </Link>

        <h1 className="h2 mt-4">{service.name}</h1>
        <p className="mt-3 text-lg text-bronze">{service.tagline}</p>

        <div className="media relative mt-8 aspect-[16/9] shadow-card-lg">
          <Image
            src={service.image}
            alt={service.imageAlt}
            fill
            priority
            sizes="(max-width: 768px) 100vw, 768px"
            className="object-cover"
          />
        </div>

        <p className="body mt-8 text-lg">{service.summary}</p>

        <dl className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Fact label="How often" value={service.cadence} />
          <Fact label="How long" value={service.typicalLength} />
          <Fact label="Your price" value="Confirmed in person, before any work starts" />
        </dl>

        <section className="mt-12">
          <h2 className="h3">Who it's for</h2>
          <ul className="mt-4 space-y-2">
            {service.bestFor.map((item) => (
              <li key={item} className="flex gap-3 text-slate">
                <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-12">
          <h2 className="h3">What's included</h2>
          <p className="body mt-2">
            The crew works this list room by room, the same way every visit.
          </p>
          <div className="mt-6 space-y-6">
            {service.includes.map((group) => (
              <div key={group.area} className="card">
                <h3 className="font-semibold text-ink">{group.area}</h3>
                <ul className="mt-3 space-y-2">
                  {group.items.map((item) => (
                    <li key={item} className="flex gap-3 text-sm text-slate">
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
          <h2 className="h3">What's not included</h2>
          <p className="body mt-2">
            Said up front, because finding out at the door helps nobody.
          </p>
          <ul className="mt-4 space-y-2">
            {service.notIncluded.map((item) => (
              <li key={item} className="flex gap-3 text-slate">
                <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-line" />
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-12">
          <h2 className="h3">Add anything you need</h2>
          <p className="body mt-2">
            Mention these at your walkthrough and we'll price them with the rest.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {ADD_ONS.map((addon) => (
              <span key={addon} className="pill border border-gold/25 bg-gold/[0.07] text-bronze">
                {addon}
              </span>
            ))}
          </div>
        </section>

        <section className="mt-12 rounded-2xl border border-gold/25 bg-gold/[0.07] p-7">
          <h2 className="font-bold text-ink">Around here specifically</h2>
          <p className="mt-2 text-slate">{service.houstonNote}</p>
        </section>

        <section className="mt-14 rounded-2xl border border-line bg-surface p-8 text-center">
          <h2 className="h3">Want {service.name.toLowerCase()} for your home?</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate">
            Book a free walkthrough. We'll look at your home, give you an exact price on the spot, and you decide
            from there.
          </p>
          <Link href="/new" className="btn-primary mt-6 w-full max-w-xs">
            Get a free quote
          </Link>
          <p className="mt-5 text-sm text-muted">
            Already a customer?{' '}
            <Link href="/signin" className="font-semibold text-bronze hover:underline">
              Sign in to book
            </Link>
          </p>
        </section>

        <section className="mt-12">
          <h2 className="h3">Other services</h2>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {others.map((other) => (
              <Link
                key={other.slug}
                href={`/services/${other.slug}`}
                className="card-interactive"
              >
                <p className="font-semibold text-ink">{other.name}</p>
                <p className="mt-1 text-sm text-slate">{other.tagline}</p>
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
    <div className="rounded-xl bg-surface px-4 py-3">
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-1.5 text-sm font-medium text-ink">{value}</dd>
    </div>
  );
}
