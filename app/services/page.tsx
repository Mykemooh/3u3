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
    'Standard, deep and move-in/move-out cleaning for homes in Katy and the surrounding Houston area. Exact price confirmed in person, before any work starts.',
};

export default function ServicesIndex() {
  return (
    <div>
      <SiteHeader />

      <main>
        <section className="px-6 pb-12 pt-12 text-center md:pt-16">
          <div className="container-narrow">
            <h1 className="mt-4 flex flex-wrap items-baseline justify-center gap-x-3 gap-y-2">
              <span className="text-7xl font-black leading-none text-ink md:text-9xl">3</span>
              <span className="text-2xl font-semibold leading-none text-slate md:text-3xl">Services,</span>
              <span className="leading-none">
                <span className="bg-gradient-to-br from-gold to-green-light bg-clip-text text-7xl font-black text-transparent md:text-9xl">
                  U
                </span>
                <span className="text-2xl font-semibold text-slate md:text-3xl">nder</span>
              </span>
              <span className="text-7xl font-black leading-none text-ink md:text-9xl">3</span>
              <span className="text-2xl font-semibold leading-none text-slate md:text-3xl">Hours.</span>
            </h1>
            <p className="lead measure mx-auto mt-8">
              3 sparkling options, each designed to deliver a professionally cleaned space in Under 3 Hours.
            </p>
          </div>
        </section>

        <section className="border-y border-line bg-surface px-6 py-16">
          <div className="container-wide grid grid-cols-1 gap-6 md:grid-cols-3">
            {SERVICES.map((service) => (
              <div key={service.slug} className="card-interactive flex flex-col text-left">
                <div className="relative h-16 w-16 overflow-hidden rounded-full shadow-card">
                  <Image src={service.image} alt={service.imageAlt} fill sizes="64px" className="object-cover" />
                </div>
                <h2 className="h3 mt-5">{service.name}</h2>
                <p className="mt-2 font-semibold text-gold">{service.tagline}</p>
                <p className="body mt-4 flex-1">{service.summary}</p>
                <Link
                  href={`/services/${service.slug}`}
                  className="mt-5 text-sm font-semibold text-bronze underline underline-offset-2 hover:text-ink"
                >
                  See what&apos;s included
                </Link>
              </div>
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
