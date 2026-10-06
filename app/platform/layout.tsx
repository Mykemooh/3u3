import { enforceMfa, type SessionUser } from '@/lib/sessionUser';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { homeForRole } from '@/lib/nav';
import SignOutButton from '@/components/SignOutButton';
import TcLogo from '@/components/tc/TcLogo';

export const dynamic = 'force-dynamic';

const NAV = [
  { href: '/platform/companies', label: 'Companies' },
  { href: '/platform/signups', label: 'Signups' },
  { href: '/platform/roles', label: 'Role template' },
  { href: '/platform/promo-codes', label: 'Promo codes' },
  { href: '/platform/integrations', label: 'Keys' },
];

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user) redirect('/signin?next=/platform');
  if (role !== 'SUPER_ADMIN') redirect(`${homeForRole(role)}?denied=1`);
  enforceMfa(session.user as unknown as SessionUser, '/platform');

  return (
    <div className="theme-tc min-h-screen bg-[#F6F7F9] text-tc-900" data-tc-surface>
      <header className="tc-dark">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <TcLogo on="dark" size="sm" />
            <span className="rounded-md bg-white/10 px-2 py-0.5 text-[12px] font-semibold text-white/70">Platform</span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="hidden text-white/60 sm:inline">{session.user.name}</span>
            <SignOutButton />
          </div>
        </div>
        <nav className="mx-auto flex max-w-[1280px] gap-5 overflow-x-auto px-6" aria-label="Platform">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="whitespace-nowrap border-b-2 border-transparent pb-3 pt-1 text-[14px] font-semibold text-white/65 hover:border-tc-lime hover:text-white">
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-[1280px] px-6 py-8">{children}</main>
    </div>
  );
}
