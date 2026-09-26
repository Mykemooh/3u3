import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import SiteHeader from '@/components/SiteHeader';
import Footer from '@/components/Footer';
import ServiceAccordion from '@/components/ServiceAccordion';
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
            <h1 className="display mt-4">
              <span className="text-gold">3U3</span>, 3 Services, Under 3 Hours.
            </h1>
            <p className="lead measure mx-auto mt-5">
              3 sparkling options, each designed to deliver a professionally cleaned space in Under 3 Hours.
            </p>
          </div>
        </section>

        <section className="px-6 pb-16">
          <div className="container-narrow space-y-5">
            {SERVICES.map((service) => (
              <ServiceAccordion key={service.slug} service={service} />
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
