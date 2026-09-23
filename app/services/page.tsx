import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import SiteHeader from '@/components/SiteHeader';
import Footer from '@/components/Footer';
import { SERVICES, ADD_ONS } from '@/lib/services';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Cleaning services in Katy & Houston — 3U3 Cleaning',
  description:
    'Standard, deep, move-in/move-out and Airbnb turnover cleaning for homes in Katy and the surrounding Houston area. Exact price confirmed in person, before any work starts.',
};

export default function ServicesIndex() {
  return (
    <div className="bg-white">
      <SiteHeader />

      <main>
        <section className="px-6 pb-12 pt-12 md:pt-16">
          <div className="container-wide">
            <p className="eyebrow">What we clean</p>
            <h1 className="display mt-4">Four services, each with its own checklist.</h1>
            <p className="lead measure mt-5">
              Whichever fits, the price is confirmed in person before any work starts — never estimated from a
              form.
            </p>
          </div>
        </section>

        <section className="px-6 pb-16">
          <div className="container-wide space-y-6">
            {SERVICES.map((service, i) => (
              <Link
                key={service.slug}
                href={`/services/${service.slug}`}
                className="group grid overflow-hidden rounded-2xl border border-line bg-white transition-all duration-200 hover:-translate-y-1 hover:border-gold/40 hover:shadow-card-lg md:grid-cols-2"
              >
                <div className={`relative aspect-[16/10] bg-surface md:aspect-auto md:min-h-[300px] ${i % 2 ? 'md:order-2' : ''}`}>
                  <Image
                    src={service.image}
                    alt={service.imageAlt}
                    fill
                    sizes="(max-width: 768px) 100vw, 50vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                </div>

                <div className="p-7 md:p-10">
                  <h2 className="h3">{service.name}</h2>
                  <p className="mt-2 font-medium text-bronze">{service.tagline}</p>
                  <p className="body mt-4">{service.summary}</p>
                  <p className="meta mt-5">
                    {service.cadence} · {service.typicalLength}
                  </p>
                  <span className="mt-6 inline-flex items-center gap-2 font-semibold text-bronze">
                    See what&apos;s included
                    <span aria-hidden className="transition-transform group-hover:translate-x-1">
                      →
                    </span>
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="section border-t border-line bg-surface">
          <div className="container-wide">
            <p className="eyebrow">Add-ons</p>
            <h2 className="h2 mt-3">Anything else, priced with the rest.</h2>
            <p className="lead measure mt-4">
              Mention these at your walkthrough and they go on the same estimate.
            </p>
            <div className="mt-8 flex flex-wrap gap-2.5">
              {ADD_ONS.map((addon) => (
                <span
                  key={addon}
                  className="rounded-full border border-line bg-white px-4 py-2 text-sm font-medium text-slate"
                >
                  {addon}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="px-6 py-16">
          <div className="container-wide overflow-hidden rounded-3xl bg-ink">
            <div className="grid items-center gap-8 md:grid-cols-2">
              <div className="p-10 md:p-14">
                <h2 className="h2 text-white">Not sure which one you need?</h2>
                <p className="mt-4 max-w-md text-lg text-white/70">
                  That&apos;s what the walkthrough is for. We&apos;ll look at the home, tell you honestly what it
                  needs, and price it on the spot.
                </p>
                <Link href="/new" className="btn-primary mt-8">
                  Get a free quote
                </Link>
              </div>
              <div className="relative hidden aspect-[4/3] md:block">
                <Image
                  src="/images/stairs-vacuum.jpg"
                  alt="A 3U3 cleaner vacuuming a carpeted staircase"
                  fill
                  sizes="50vw"
                  className="object-cover"
                />
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
