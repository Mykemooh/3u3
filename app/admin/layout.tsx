import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { signOutLink } from '@/lib/nav';
import SignOutButton from '@/components/SignOutButton';
import Logo from '@/components/Logo';

const NAV = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/leads', label: 'Leads' },
  { href: '/admin/clients', label: 'Clients' },
  { href: '/admin/bookings', label: 'Bookings' },
  { href: '/admin/crew', label: 'Crew & Schedule' },
  { href: '/admin/services', label: 'Services' },
  { href: '/admin/rates', label: 'Rates' },
  { href: '/admin/notifications', label: 'Notifications' },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

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
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
