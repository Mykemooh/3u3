import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { signOutLink } from '@/lib/nav';
import SignOutButton from '@/components/SignOutButton';

const NAV = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/bookings', label: 'Bookings' },
  { href: '/admin/crew', label: 'Crew & Schedule' },
  { href: '/admin/rates', label: 'Client Rates' },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  return (
    <div className="min-h-screen bg-cream">
      <header className="bg-ink text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-lg font-black tracking-tight">
              3<span className="text-gold">U</span>3 <span className="text-sm font-semibold tracking-widest text-white/60">ADMIN</span>
            </p>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-white/60">{session?.user?.name}</span>
            <SignOutButton />
          </div>
        </div>
        <nav className="mx-auto flex max-w-5xl gap-1 px-6 pb-2">
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
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
