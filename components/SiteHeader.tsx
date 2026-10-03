import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { homeForRole } from '@/lib/nav';
import Logo from '@/components/Logo';
import MobileNav from '@/components/MobileNav';

const NAV_LINKS = [
  { href: '/services', label: 'Services' },
  { href: '/about', label: 'About us' },
];

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
      <div className="container-wide flex items-center justify-between gap-4 px-6 py-4 md:py-5">
        <Link href="/" aria-label="3U3 Cleaning home" className="flex items-center">
          <Logo size="sm" />
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="nav-link">
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          {user?.role ? (
            <Link href={homeForRole(user.role)} className="btn-primary btn-sm hidden sm:inline-flex">
              {user.role === 'CUSTOMER' ? 'My account' : 'Dashboard'}
            </Link>
          ) : (
            <>
              <Link href="/signin" className="nav-link hidden sm:inline">
                Sign in
              </Link>
              <Link href="/new" className="btn-primary btn-sm hidden sm:inline-flex">
                Get a free quote
              </Link>
            </>
          )}
          <MobileNav
            links={NAV_LINKS}
            signedIn={!!user?.role}
            accountHref={homeForRole(user?.role)}
            accountLabel={user?.role === 'CUSTOMER' ? 'My account' : 'Dashboard'}
          />
        </div>
      </div>
    </header>
  );
}
