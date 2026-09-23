import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import SiteHeader from '@/components/SiteHeader';
import Footer from '@/components/Footer';
import FamilyPortrait from '@/components/FamilyPortrait';
import { ABOUT_INTRO, ABOUT_CLOSING, PILLARS } from '@/lib/about';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'About us — a family cleaning business in Katy, Texas | 3U3 Cleaning',
  description:
    'We are parents of three boys building a family cleaning business in Katy, just west of Houston. Faith, family and future — and what each one means for the people whose homes we clean.',
};

export default function AboutPage() {
  return (
    <div className="bg-white">
      <SiteHeader />

      <main>
        {/* ---------- Who we are, with the family beside it ---------- */}
        <section className="px-6 pb-16 pt-12 md:pt-16">
          <div className="container-wide grid items-center gap-12 lg:grid-cols-[1.15fr_1fr] lg:gap-16">
            <div>
              <p className="eyebrow">Our story</p>
              <h1 className="display mt-4">A Houston family, cleaning Houston homes.</h1>

              <div className="mt-6 space-y-5">
                {ABOUT_INTRO.map((paragraph) => (
                  <p key={paragraph.slice(0, 24)} className="lead max-w-[54ch]">
                    {paragraph}
                  </p>
                ))}
              </div>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Link href="/new" className="btn-primary">
                  Get a free quote
                </Link>
                <Link href="/services" className="btn-secondary">
                  See what we clean
                </Link>
              </div>
            </div>

            <FamilyPortrait className="mx-auto w-full max-w-sm lg:max-w-none" />
          </div>
        </section>

        {/* ---------- The three Fs ---------- */}
        <section className="section border-t border-line bg-surface">
          <div className="container-wide">
            <p className="eyebrow">What we run on</p>
            <h2 className="h2 mt-3">Three things we hold to.</h2>
            <p className="lead measure mt-4">
              Every family business has a list like this. Ours is short enough to actually keep.
            </p>

            <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
              {PILLARS.map((pillar) => (
                <article
                  key={pillar.word}
                  className="flex flex-col rounded-2xl border border-line bg-white p-7 shadow-card"
                >
                  <span
                    aria-hidden
                    className="flex h-12 w-12 items-center justify-center rounded-full bg-gold text-xl font-extrabold text-ink"
                  >
                    F
                  </span>
                  <h3 className="h3 mt-5">{pillar.word}</h3>
                  <p className="mt-2 font-medium text-bronze">{pillar.heading}</p>
                  <p className="body mt-4">{pillar.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- What it adds up to, for you ---------- */}
        <section className="section border-t border-line">
          <div className="container-wide grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">
            <div className="media relative aspect-[4/3] shadow-card-lg">
              <Image
                src="/images/making-bed.jpg"
                alt="A 3U3 cleaner making up a bed in a bright bedroom"
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover"
              />
            </div>

            <div>
              <p className="eyebrow">What it means for you</p>
              <h2 className="h2 mt-3">You get the owners&apos; standard, not a franchise script.</h2>
              <p className="lead mt-5 max-w-[52ch]">{ABOUT_CLOSING}</p>
              <p className="meta mt-5">
                No obligation · Nothing to pay up front · Priced in person, never by form
              </p>
              <Link href="/new" className="btn-primary mt-8">
                Book a free walkthrough
              </Link>
            </div>
          </div>
        </section>

        {/* ---------- Closing band, matching the other public pages ---------- */}
        <section className="px-6 pb-20">
          <div className="container-wide overflow-hidden rounded-3xl bg-ink">
            <div className="grid items-center gap-8 md:grid-cols-2">
              <div className="p-10 md:p-14">
                <h2 className="h2 text-white">Come and meet us at your front door.</h2>
                <p className="mt-4 max-w-md text-lg text-white/70">
                  The walkthrough is free and takes about twenty minutes. Worst case, you get an honest opinion
                  about your house and we go on our way.
                </p>
                <Link href="/new" className="btn-primary mt-8">
                  Get a free quote
                </Link>
              </div>
              <div className="relative hidden aspect-[4/3] md:block">
                <Image
                  src="/images/kitchen-counter.jpg"
                  alt="A 3U3 cleaner wiping down a kitchen counter"
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
