import Link from 'next/link';
import Image from 'next/image';
import SiteHeader from '@/components/SiteHeader';
import Footer from '@/components/Footer';
import WelcomeCta from '@/components/WelcomeCta';
import FamilyPortrait from '@/components/FamilyPortrait';
import { SERVICES } from '@/lib/services';
import { ABOUT_TEASER } from '@/lib/about';

// WelcomeCta and SiteHeader both read the session to decide between
// "Get a quote" and "Book now", so this page can't be baked at build time.
export const dynamic = 'force-dynamic';

const HOW_IT_WORKS = [
  {
    title: 'Book a free walkthrough',
    description:
      "Tell us about your home and pick a time. Takes under a minute, and there's nothing to pay.",
    image: '/images/dusting-shelves.jpg',
    alt: 'A 3U3 cleaner dusting a living-room shelf',
  },
  {
    title: 'We price it at your door',
    description:
      'Someone comes out, looks at the actual house, and gives you an exact price. No estimate-by-form, no surprises later.',
    image: '/images/kitchen-island.jpg',
    alt: 'A 3U3 cleaner wiping a kitchen island in a bright home',
  },
  {
    title: 'Approve it and book',
    description:
      'Say yes and your price is locked in. Book a one-off or put it on a schedule that suits you.',
    image: '/images/stairs-vacuum.jpg',
    alt: 'A 3U3 cleaner vacuuming a carpeted staircase',
  },
];

export default function WelcomePage() {
  return (
    <>
      <SiteHeader />

      <main>
        {/* ---------- Hero: words left, the work itself on the right ---------- */}
        <section className="px-6 pb-16 pt-12 md:pb-24 md:pt-20">
          <div className="container-wide grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
            <div>
              <p className="eyebrow">Katy &amp; the Houston area</p>
              <h1 className="display mt-4">A spotless home, booked in minutes.</h1>
              <p className="lead measure mt-5">
                Family owned by parents of three boys, built in Texas. A real person walks your home and gives you
                an exact price at the door — then you decide.
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Link href="/new" className="btn-primary">
                  Get a free quote
                </Link>
                <Link href="/services" className="btn-secondary">
                  See what we clean
                </Link>
              </div>

              <p className="meta mt-6">No obligation · Nothing to pay up front · Priced in person, never by form</p>
            </div>

            <div className="media relative aspect-[4/3] shadow-card-lg lg:aspect-[5/4]">
              <Image
                src="/images/hero-living-room.jpg"
                alt="A 3U3 cleaner vacuuming the rug in a bright, open-plan living room"
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover"
              />
            </div>
          </div>
        </section>

        {/* ---------- Services, each one photo-led ---------- */}
        <section className="section border-t border-line bg-surface">
          <div className="container-wide">
            <p className="eyebrow">What we clean</p>
            <h2 className="h2 mt-3">Three services, each with its own checklist.</h2>
            <p className="lead measure mt-4">
              Tap any one to see exactly what the crew does, room by room — and what it doesn&apos;t cover.
            </p>

            <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2">
              {SERVICES.map((service) => (
                <Link
                  key={service.slug}
                  href={`/services/${service.slug}`}
                  className="card-line group overflow-hidden rounded-2xl border border-line bg-white transition-all duration-200 hover:-translate-y-1 hover:border-gold/40 hover:shadow-card-lg"
                >
                  <div className="relative aspect-[16/10] overflow-hidden bg-surface">
                    <Image
                      src={service.image}
                      alt={service.imageAlt}
                      fill
                      sizes="(max-width: 640px) 100vw, 50vw"
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  </div>
                  <div className="p-6">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="h3">{service.name}</h3>
                      <span
                        aria-hidden
                        className="mt-1 shrink-0 text-bronze transition-transform group-hover:translate-x-1"
                      >
                        →
                      </span>
                    </div>
                    <p className="body mt-2">{service.tagline}</p>
                    <p className="meta mt-4">
                      {service.cadence} · {service.typicalLength}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- How it works ---------- */}
        <section id="how-it-works" className="section scroll-mt-20 border-t border-line">
          <div className="container-wide">
            <p className="eyebrow">How it works</p>
            <h2 className="h2 mt-3">Three steps, no guesswork.</h2>

            <div className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-3">
              {HOW_IT_WORKS.map((step, i) => (
                <div key={step.title}>
                  <div className="media relative aspect-[4/3] shadow-card">
                    <Image
                      src={step.image}
                      alt={step.alt}
                      fill
                      sizes="(max-width: 768px) 100vw, 33vw"
                      className="object-cover"
                    />
                  </div>
                  <div className="mt-6 flex items-center gap-3">
                    <span className="step-dot bg-gold text-ink">{i + 1}</span>
                    <h3 className="text-lg font-bold">{step.title}</h3>
                  </div>
                  <p className="body mt-3">{step.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- Who you're actually letting in ---------- */}
        <section className="section border-t border-line bg-surface">
          <div className="container-wide grid items-center gap-10 lg:grid-cols-[1fr_1.2fr] lg:gap-16">
            <FamilyPortrait className="mx-auto w-full max-w-[19rem] lg:max-w-none" />

            <div>
              <p className="eyebrow">About us</p>
              <h2 className="h2 mt-3">A family business, in the plain sense of it.</h2>
              <p className="lead mt-5 max-w-[52ch]">{ABOUT_TEASER}</p>

              <ul className="mt-7 flex flex-wrap gap-2.5">
                {['Faith', 'Family', 'Future'].map((f) => (
                  <li
                    key={f}
                    className="rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-slate"
                  >
                    {f}
                  </li>
                ))}
              </ul>

              <Link href="/about" className="btn-secondary mt-8">
                Read our story
              </Link>
            </div>
          </div>
        </section>

        {/* ---------- Sign in / quote / book — changes with who's looking ---------- */}
        <section id="service-area" className="section scroll-mt-20 border-t border-line bg-surface">
          <div className="container-narrow">
            <WelcomeCta />
          </div>
        </section>

        {/* ---------- Closing band ---------- */}
        <section className="px-6 pb-20">
          <div className="container-wide overflow-hidden rounded-3xl bg-ink">
            <div className="grid items-center gap-8 md:grid-cols-2">
              <div className="p-10 md:p-14">
                <h2 className="h2 text-white">Find out what your home costs.</h2>
                <p className="mt-4 max-w-md text-lg text-white/70">
                  Book a free walkthrough. We look at the house, tell you honestly what it needs, and price it on
                  the spot.
                </p>
                <Link href="/new" className="btn-primary mt-8">
                  Get a free quote
                </Link>
              </div>
              <div className="relative hidden aspect-[4/3] md:block">
                <Image
                  src="/images/bathroom-mirror.jpg"
                  alt="A 3U3 cleaner polishing a bathroom mirror"
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
    </>
  );
}
