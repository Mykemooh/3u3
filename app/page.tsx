import Link from 'next/link';
import Image from 'next/image';
import SiteHeader from '@/components/SiteHeader';
import Footer from '@/components/Footer';
import TestimonialCarousel from '@/components/TestimonialCarousel';
import { getTenant } from '@/lib/data';
import { getFeaturedReviews } from '@/lib/reviews';
import { SERVICES, HIDDEN_SERVICE_KEYS } from '@/lib/services';

export const dynamic = 'force-dynamic';

// Native pixel sizes of the upscaled (3x + Lanczos) mark pieces — see
// public/brand/mark-*.png.
const LEFT_3 = { w: 633, h: 624 };
const RIGHT_3 = { w: 630, h: 624 };

const PHILOSOPHY = [
  { n: '01', title: 'Your time matters.', body: 'Every hour we spend cleaning is an hour you got back for the people and things you actually care about.' },
  { n: '02', title: 'Your home matters.', body: 'Not a stop on a route. We work the same checklist every visit so nothing quietly gets skipped on a busy week.' },
  { n: '03', title: 'The details matter.', body: 'The baseboard nobody checks. The grout line everyone else walks past. That’s the actual job.' },
] as const;

export default async function WelcomePage() {
  const tenant = await getTenant();
  const featuredReviews = tenant ? await getFeaturedReviews(tenant.id) : [];
  const services = SERVICES.filter((s) => !HIDDEN_SERVICE_KEYS.includes(s.key));

  return (
    <div>
      <SiteHeader />

      <main>
        {/* ---------- Hero ---------- */}
        <section className="px-6 pt-14 text-center md:pt-20">
          <div className="container-narrow">
            <div role="img" aria-label="3U3 Cleaning" className="mx-auto flex h-14 items-center justify-center md:h-20">
              <Image src="/brand/mark-3-left.png" alt="" width={LEFT_3.w} height={LEFT_3.h} priority className="h-full w-auto select-none" aria-hidden="true" />
              <div className="u-gradient-mask h-full w-[48px] shrink-0 md:w-[68px]" aria-hidden="true" />
              <Image src="/brand/mark-3-right.png" alt="" width={RIGHT_3.w} height={RIGHT_3.h} priority className="h-full w-auto select-none" aria-hidden="true" />
            </div>

            <p className="eyebrow mt-8">Professional cleaning · Katy &amp; Houston</p>
            <h1 className="display mx-auto mt-4 max-w-2xl">
              Come home
              <br />
              to clean.
            </h1>
            <p className="lead measure mx-auto mt-6">
              More time for the people and things you actually care about. A real person prices your home at
              the door — never a guess from a form.
            </p>

            <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
              <Link href="/new" className="btn-primary">
                Get a free quote <span className="btn-arrow" aria-hidden="true">→</span>
              </Link>
              <Link href="/services" className="btn-secondary">
                See what we clean
              </Link>
            </div>
            <p className="meta mt-5">No obligation · Nothing to pay up front · Priced in person, never by form</p>
          </div>

          <div className="container-wide mt-14">
            <div className="media relative aspect-[16/10] shadow-card-lg md:aspect-[16/8]">
              <Image
                src="/images/hero-living-room.jpg"
                alt="A bright, freshly cleaned living room with natural light"
                fill
                priority
                sizes="100vw"
                className="object-cover"
              />
            </div>
          </div>
        </section>

        {/* ---------- Service discovery ---------- */}
        <section className="section border-t border-line">
          <div className="container-wide">
            <p className="eyebrow">Our services</p>
            <h2 className="h2 mt-3">Three ways in, one standard.</h2>

            <div className="mt-10 divide-y divide-line border-y border-line">
              {services.map((service, i) => (
                <Link
                  key={service.slug}
                  href={`/services/${service.slug}`}
                  className="group flex items-center justify-between gap-6 px-2 py-7 transition-colors hover:bg-surface/60 md:py-9"
                >
                  <div className="flex items-center gap-5 md:gap-8">
                    <span className="meta w-8 shrink-0 transition-colors group-hover:text-bronze md:w-12 md:text-base">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <div>
                      <p className="text-xl font-bold tracking-[-0.01em] text-ink transition-colors group-hover:text-bronze md:text-2xl">
                        {service.name}
                      </p>
                      <p className="mt-1 hidden text-slate sm:block">{service.tagline}</p>
                    </div>
                  </div>
                  <span
                    aria-hidden="true"
                    className="shrink-0 text-2xl text-muted transition-all duration-200 group-hover:translate-x-1 group-hover:text-bronze"
                  >
                    →
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- Philosophy ---------- */}
        <section className="section border-t border-line bg-surface">
          <div className="container-wide">
            <p className="eyebrow">Why 3U3</p>
            <h2 className="h2 mt-3">A short list we actually keep.</h2>

            <div className="mt-12 grid grid-cols-1 gap-10 md:grid-cols-3 md:gap-8">
              {PHILOSOPHY.map((p) => (
                <div key={p.n}>
                  <span className="meta">{p.n}</span>
                  <p className="mt-3 text-2xl font-bold tracking-[-0.01em] text-ink">{p.title}</p>
                  <p className="body mt-3">{p.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- Testimonials ---------- */}
        {featuredReviews.length > 0 && (
          <section className="section border-t border-line">
            <div className="container-narrow text-center">
              <p className="eyebrow">What our clients say</p>
              <div className="mt-10">
                <TestimonialCarousel reviews={featuredReviews} />
              </div>
            </div>
          </section>
        )}

        {/* ---------- The broom (kept — it's the one playful beat on the page) ---------- */}
        <div className="relative mx-auto max-w-sm overflow-hidden px-6 py-10">
          <p className="sweep-reveal-text text-center text-lg font-semibold text-ink">Come on, commit to something!</p>
          <span className="broom-sweep pointer-events-none absolute top-1/2 -translate-y-1/2 text-[72px] leading-none" aria-hidden="true">
            🧹
          </span>
        </div>

        {/* ---------- Final CTA ---------- */}
        <section className="px-6 pb-20">
          <div className="container-wide overflow-hidden rounded-3xl bg-ink text-center">
            <div className="px-8 py-16 md:px-14 md:py-20">
              <h2 className="h2 text-white">You have better things to do.</h2>
              <p className="mx-auto mt-4 max-w-md text-lg text-white/70">Let 3U3 handle the cleaning.</p>
              <Link href="/new" className="btn-primary mt-8">
                Get a free quote <span className="btn-arrow" aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
