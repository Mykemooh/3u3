import Link from 'next/link';
import Logo from '@/components/Logo';

export default function Footer() {
  return (
    <footer className="bg-ink text-white/60">
      <div className="container-narrow px-6 py-12">
        <div className="flex flex-col items-center gap-8 text-center md:flex-row md:items-start md:justify-between md:text-left">
          <div className="flex flex-col items-center md:items-start">
            <Logo variant="light" size="sm" />
            <p className="mt-3 max-w-[220px] text-xs text-white/40">
              Family Owned by Parents of Three boys, Built in Texas
            </p>
          </div>

          <div className="flex flex-col items-center gap-2 md:items-start">
            <p className="text-xs font-semibold uppercase tracking-wider text-white/30">Get started</p>
            <Link href="/new" className="text-sm hover:text-gold">Book a free estimate</Link>
            <Link href="/signin" className="text-sm hover:text-gold">Sign in</Link>
          </div>

          <div className="flex flex-col items-center gap-2 md:items-start">
            <p className="text-xs font-semibold uppercase tracking-wider text-white/30">Staff</p>
            <Link href="/signin?role=crew" className="text-sm hover:text-gold">Crew sign-in</Link>
            <Link href="/signin?role=admin" className="text-sm hover:text-gold">Admin sign-in</Link>
          </div>
        </div>

        <div className="mt-10 border-t border-white/10 pt-6 text-center text-xs text-white/30">
          © {new Date().getFullYear()} 3U3 Cleaning. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
