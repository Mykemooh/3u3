import Link from 'next/link';
import Logo from '@/components/Logo';

export default function WelcomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-white px-6 py-12 text-center">
      <Logo size="lg" />
      <p className="mt-4 text-sm font-semibold uppercase tracking-[0.14em] text-slate">
        Clean spaces. Brighter days.
      </p>

      <div className="mt-10 flex flex-col gap-3 sm:flex-row">
        <Link href="/new" className="btn-primary">
          Get a free quote
          <span aria-hidden="true">→</span>
        </Link>
        <Link href="/signin" className="btn-secondary">
          Sign in
        </Link>
      </div>
    </main>
  );
}
