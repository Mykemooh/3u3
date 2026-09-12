import Link from 'next/link';
import Logo from '@/components/Logo';
import Footer from '@/components/Footer';
import { SERVICE_LABELS } from '@/lib/data';

const HOW_IT_WORKS = [
  {
    title: 'Book a free quote visit',
    description: "Tell us a bit about your home and pick a time — takes less than a minute.",
  },
  {
    title: 'We confirm your price on the spot',
    description: 'A team member visits in person and gives you an exact price, no surprises.',
  },
  {
    title: 'Enjoy a spotless home',
    description: 'Book one-time or recurring cleanings on a schedule that works for you.',
  },
];

export default function WelcomePage() {
  return (
    <main className="bg-ink">
      {/* Hero */}
      <section className="relative overflow-hidden px-6 py-20 md:py-28">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background:
              'radial-gradient(circle at 20% 20%, rgba(210,150,30,0.35), transparent 45%), radial-gradient(circle at 80% 70%, rgba(138,109,29,0.3), transparent 50%)',
          }}
        />
        <div className="relative flex flex-col items-center text-center text-white">
          <Logo variant="light" size="lg" />
          <p className="mt-4 max-w-xs text-sm italic text-white/70">
            Family Owned by Parents of Three boys, Built in Texas
          </p>
          <h1 className="mt-8 max-w-xl text-3xl font-bold leading-tight md:text-4xl">
            A spotless home, booked in minutes.
          </h1>
          <p className="mt-3 max-w-md text-white/60">
            Get a free, no-obligation quote from a real person at your door.
          </p>
          <Link href="/new" className="btn-primary mt-8 w-full max-w-xs text-base">
            Get a free quote
          </Link>
          <Link href="/signin" className="mt-4 text-sm text-white/50 hover:text-gold">
            Already a customer? Sign in
          </Link>
        </div>
      </section>

      {/* Services */}
      <section className="section bg-cream">
        <div className="container-narrow">
          <h2 className="text-center text-2xl font-bold text-ink md:text-3xl">What we clean</h2>
          <p className="mt-2 text-center text-sm text-ink/60">Pick the service that fits — we'll confirm your exact price at the quote visit.</p>
          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {Object.values(SERVICE_LABELS).map((label) => (
              <div
                key={label}
                className="card flex items-center justify-between transition hover:border-gold hover:shadow-gold"
              >
                <span className="font-semibold text-ink">{label}</span>
                <span className="pill bg-gold/15 text-bronze">Available</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="section bg-white">
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
