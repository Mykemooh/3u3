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

const TRUST_BAR: { label: string; blurb: string; icon: 'sparkle' | 'shield' | 'leaf' | 'home'; accent: 'gold' | 'green' }[] = [
  { label: 'Reliable', blurb: 'On time. Every time.', icon: 'sparkle', accent: 'green' },
  { label: 'Trusted', blurb: 'Vetted team. Professional care.', icon: 'shield', accent: 'gold' },
  { label: 'Healthy', blurb: 'Cleaner spaces. Better living.', icon: 'leaf', accent: 'green' },
  { label: 'Customized', blurb: 'Your space. Your needs.', icon: 'home', accent: 'gold' },
];

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

// PLACEHOLDER — not real customers. Swap every quote/name/location for an
// actual review before this ships; do not present these as genuine.
const TESTIMONIALS_PLACEHOLDER = [
  {
    quote: '"[Placeholder review — replace with a real customer quote before launch.]"',
    name: 'Placeholder Name',
    context: 'Placeholder — Katy, TX',
  },
  {
    quote: '"[Placeholder review — replace with a real customer quote before launch.]"',
    name: 'Placeholder Name',
    context: 'Placeholder — Houston, TX',
  },
  {
    quote: '"[Placeholder review — replace with a real customer quote before launch.]"',
    name: 'Placeholder Name',
    context: 'Placeholder — Cypress, TX',
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
                  <span aria-hidden="true">→</span>
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

        {/* ---------- Trust bar: four short reasons, right under the fold ---------- */}
        <section className="border-y border-line bg-white px-6 py-10">
          <div className="container-wide grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-4 md:divide-x md:divide-line">
            {TRUST_BAR.map((item) => (
              <div key={item.label} className="flex flex-col items-center gap-2 text-center md:px-6">
                <TrustIcon name={item.icon} className={item.accent === 'gold' ? 'text-gold' : 'text-green-light'} />
                <p className="text-sm font-bold uppercase tracking-[0.1em] text-ink">{item.label}</p>
                <p className="text-sm text-slate">{item.blurb}</p>
              </div>
            ))}
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
                    <span className="step-dot bg-gold text-white">{i + 1}</span>
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

        {/* ---------- Testimonials — PLACEHOLDER copy, swap before launch ---------- */}
        <section className="section border-t border-line">
          <div className="container-wide">
            <p className="eyebrow">What clients say</p>
            <h2 className="h2 mt-3">Placeholder reviews — swap these for real ones.</h2>
            <p className="lead measure mt-4">
              This section is wired up and ready; it just needs your actual customer quotes in place of these
              placeholders.
            </p>

            <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
              {TESTIMONIALS_PLACEHOLDER.map((t, i) => (
                <figure key={i} className="card flex flex-col">
                  <div className="flex gap-0.5 text-gold" aria-hidden="true">
                    {Array.from({ length: 5 }).map((_, star) => (
                      <svg key={star} viewBox="0 0 20 20" className="h-4 w-4 fill-current">
                        <path d="M10 1.5l2.6 5.4 5.9.8-4.3 4.2 1 5.9L10 15l-5.2 2.8 1-5.9-4.3-4.2 5.9-.8L10 1.5Z" />
                      </svg>
                    ))}
                  </div>
                  <blockquote className="body mt-4 flex-1 italic text-slate">{t.quote}</blockquote>
                  <figcaption className="mt-5 border-t border-line pt-4">
                    <p className="font-semibold text-ink">{t.name}</p>
                    <p className="meta">{t.context}</p>
                  </figcaption>
                </figure>
              ))}
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

const TRUST_ICON_PATHS: Record<string, React.ReactNode> = {
  sparkle: (
    <>
      <path d="M11 3.5 12.4 8l4.6 1.4-4.6 1.4L11 15.3l-1.4-4.5L5 9.4l4.6-1.4L11 3.5Z" />
      <path d="M17.5 14.5 18.2 17l2.3.8-2.3.8-.7 2.4-.7-2.4-2.3-.8 2.3-.8.7-2.5Z" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3.5 18.5 6v5c0 4.5-3 7.8-6.5 9-3.5-1.2-6.5-4.5-6.5-9V6L12 3.5Z" />
      <path d="m9.3 12.2 2 2 3.8-4.2" />
    </>
  ),
  leaf: (
    <>
      <path d="M5 19c9-.2 13.5-5.6 14-14.5-9 .3-13.6 5.4-14 14.5Z" />
      <path d="M6 18c3-3.4 6-6.4 12.5-12.8" />
    </>
  ),
  home: (
    <>
      <path d="M4 11.2 12 4l8 7.2" />
      <path d="M6 10v9a1 1 0 0 0 1 1h3v-6h4v6h3a1 1 0 0 0 1-1v-9" />
    </>
  ),
};

function TrustIcon({ name, className = '' }: { name: 'sparkle' | 'shield' | 'leaf' | 'home'; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-8 w-8 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {TRUST_ICON_PATHS[name]}
    </svg>
  );
}
