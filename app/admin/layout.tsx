import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { signOutLink, homeForRole } from '@/lib/nav';
import SignOutButton from '@/components/SignOutButton';
import Logo from '@/components/Logo';
import AccessNotice from '@/components/AccessNotice';

// Every admin page reads live operational data (bookings, leads, rates,
// crew). Setting this here cascades to all nested /admin pages, so none of
// them ever get baked into a static build-time snapshot.
export const dynamic = 'force-dynamic';

const NAV = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/pipeline', label: 'Pipeline' },
  { href: '/admin/leads', label: 'Leads' },
  { href: '/admin/estimates', label: 'Estimates' },
  { href: '/admin/clients', label: 'Clients' },
  { href: '/admin/schedule', label: 'Schedule' },
  { href: '/admin/bookings', label: 'Bookings' },
  { href: '/admin/invoices', label: 'Invoices' },
  { href: '/admin/crew', label: 'Crew & Schedule' },
  { href: '/admin/services', label: 'Services' },
  { href: '/admin/rates', label: 'Rates' },
  { href: '/admin/notifications', label: 'Notifications' },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  // The authoritative check. The middleware guards the edge, but it can
  // only read the session cookie by guessing at its name; this runs in
  // Node against the real session and is the one that actually decides.
  // Keeping it here means a middleware that fails open still can't let
  // anyone into the admin.
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user) redirect('/signin?next=/admin');
  if (role !== 'ADMIN') redirect(`${homeForRole(role)}?denied=1`);

  return (
    <div className="min-h-screen bg-white">
      <header className="bg-ink text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <Logo size="sm" className="h-10 w-auto" />
            <span className="text-xs font-semibold uppercase tracking-widest text-white/50">Admin</span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-white/60">{session?.user?.name}</span>
            <SignOutButton />
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl flex-wrap gap-1 px-6 pb-2">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <AccessNotice />
        {children}
      </main>
    </div>
  );
}
