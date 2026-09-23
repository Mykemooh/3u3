import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { homeForRole } from '@/lib/nav';
import Logo from '@/components/Logo';

/**
 * One header across every public page. It carries the primary CTA at all
 * times — the single most effective thing a service-business site does —
 * and swaps that CTA for a way back in once someone is signed in, so a
 * returning customer is never asked to request a quote they already have.
 */
export default async function SiteHeader() {
  const session = await getServerSession(authOptions);
  const user = session?.user as { name?: string; role?: string } | undefined;

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-white/85 backdrop-blur-md">
      <div className="container-wide flex items-center justify-between gap-4 px-6 py-3">
        <Link href="/" aria-label="3U3 Cleaning home" className="flex items-center">
          <span className="inline-flex items-center rounded-xl bg-ink px-3.5 py-2">
            <Logo size="sm" className="h-11 w-auto" />
          </span>
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          <Link href="/services" className="text-sm font-semibold text-slate transition hover:text-ink">
            Services
          </Link>
          <Link href="/#how-it-works" className="text-sm font-semibold text-slate transition hover:text-ink">
            How it works
          </Link>
          <Link href="/#service-area" className="text-sm font-semibold text-slate transition hover:text-ink">
            Service area
          </Link>
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          {user?.role ? (
            <Link href={homeForRole(user.role)} className="btn-primary btn-sm">
              {user.role === 'CUSTOMER' ? 'Book now' : 'Dashboard'}
            </Link>
          ) : (
            <>
              <Link
                href="/signin"
                className="hidden text-sm font-semibold text-slate transition hover:text-ink sm:inline"
              >
                Sign in
              </Link>
              <Link href="/new" className="btn-primary btn-sm">
                Get a free quote
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
