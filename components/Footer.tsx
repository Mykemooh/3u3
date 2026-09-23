import Link from 'next/link';
import Logo from '@/components/Logo';
import { SERVICES } from '@/lib/services';

export default function Footer() {
  return (
    <footer className="bg-ink text-white">
      <div className="container-wide px-6 py-14">
        <div className="grid gap-10 md:grid-cols-4">
          <div>
            <Logo variant="light" size="sm" className="h-10 w-auto" />
            <p className="mt-4 max-w-[230px] text-sm text-white/55">
              Family owned by parents of three boys, built in Texas. Serving Katy and the surrounding Houston
              area.
            </p>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-white/40">Services</p>
            <ul className="mt-4 space-y-2.5">
              {SERVICES.map((s) => (
                <li key={s.slug}>
                  <Link href={`/services/${s.slug}`} className="text-sm text-white/75 transition hover:text-gold">
                    {s.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-white/40">Get started</p>
            <ul className="mt-4 space-y-2.5">
              <li>
                <Link href="/new" className="text-sm text-white/75 transition hover:text-gold">
                  Get a free quote
                </Link>
              </li>
              <li>
                <Link href="/services" className="text-sm text-white/75 transition hover:text-gold">
                  All services
                </Link>
              </li>
              <li>
                <Link href="/#how-it-works" className="text-sm text-white/75 transition hover:text-gold">
                  How it works
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-white/40">Account</p>
            <ul className="mt-4 space-y-2.5">
              <li>
                <Link href="/signin" className="text-sm text-white/75 transition hover:text-gold">
                  Sign in
                </Link>
              </li>
            </ul>
            <p className="mt-4 max-w-[220px] text-xs text-white/40">
              Customers, cleaners and office staff all sign in at the same place.
            </p>
          </div>
        </div>

        <div className="mt-12 border-t border-white/10 pt-6 text-xs text-white/40">
          © {new Date().getFullYear()} 3U3 Cleaning. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
