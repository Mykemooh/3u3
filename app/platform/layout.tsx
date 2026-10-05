import { enforceMfa, type SessionUser } from '@/lib/sessionUser';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { homeForRole } from '@/lib/nav';
import SignOutButton from '@/components/SignOutButton';

export const dynamic = 'force-dynamic';

const NAV = [
  { href: '/platform/companies', label: 'Companies' },
  { href: '/platform/promo-codes', label: 'Promo codes' },
];

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user) redirect('/signin?next=/platform');
  if (role !== 'SUPER_ADMIN') redirect(`${homeForRole(role)}?denied=1`);
  enforceMfa(session.user as unknown as SessionUser, '/platform');

  return (
    <div className="min-h-screen bg-white">
      <header className="bg-ink text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold uppercase tracking-widest text-gold">3U3 Platform</span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-white/60">{session.user.name}</span>
            <SignOutButton />
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl flex-wrap gap-1 px-6 pb-2">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="rounded-lg px-3 py-1.5 text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white">
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
