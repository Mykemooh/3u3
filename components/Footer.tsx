import Link from 'next/link';
import Logo from '@/components/Logo';
import { SERVICES } from '@/lib/services';
import { getTenant } from '@/lib/data';
import { isHouseBrand } from '@/lib/brand';

export default async function Footer() {
  // 3U3's own footer carries its founders' story and services; any other
  // company's pages (estimates, standby offers, help) get a plain footer in
  // their own name rather than 3U3's.
  const tenant = await getTenant().catch(() => undefined);
  if (tenant && !isHouseBrand(tenant)) {
    return (
      <footer className="bg-ink text-white">
        <div className="container-wide flex flex-wrap items-center justify-between gap-4 px-6 py-10 text-sm">
          <div>
            <Logo variant="light" size="sm" />
            {tenant.tagline && <p className="mt-2 text-white/55">{tenant.tagline}</p>}
          </div>
          <span className="flex flex-wrap gap-4 text-xs text-white/50">
            <span>© {new Date().getFullYear()} {tenant.name}</span>
            <Link href="/signin" className="hover:text-white/80">Sign in</Link>
            <Link href="/privacy" className="hover:text-white/80">Privacy</Link>
            <Link href="/terms" className="hover:text-white/80">Terms</Link>
          </span>
        </div>
      </footer>
    );
  }
  return (
    <footer className="bg-ink text-white">
      <div className="container-wide px-6 py-14">
        <div className="grid gap-10 md:grid-cols-4">
          <div>
            <Logo variant="light" size="sm" />
            <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-gold-light">
              Clean spaces. Brighter days.
            </p>
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
                <Link href="/about" className="text-sm text-white/75 transition hover:text-gold">
                  About us
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

        <div className="mt-14 border-t border-white/10 pt-10">
          <p className="text-[2rem] font-bold leading-[0.95] tracking-[-0.02em] sm:text-[2.75rem]">
            More time for life.
          </p>
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-6 text-xs text-white/40">
          <span>© {new Date().getFullYear()} 3U3 Cleaning. All rights reserved.</span>
          <span className="flex gap-4">
            <Link href="/privacy" className="hover:text-white/80">Privacy</Link>
            <Link href="/terms" className="hover:text-white/80">Terms</Link>
            <Link href="/start" className="hover:text-white/80">Run your own cleaning company on TrashCan</Link>
          </span>
        </div>
      </div>
    </footer>
  );
}
