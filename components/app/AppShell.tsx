import Link from 'next/link';
import Logo from '@/components/Logo';
import SignOutButton from '@/components/SignOutButton';
import AccessNotice from '@/components/AccessNotice';
import { BottomTabs, HeaderTabs, type Tab } from '@/components/app/TabBar';

export const CUSTOMER_TABS: Tab[] = [
  { href: '/account', label: 'Home', icon: 'home' },
  { href: '/book', label: 'Book', icon: 'calendar' },
  { href: '/account/invoices', label: 'Invoices', icon: 'receipt' },
];

export const CREW_TABS: Tab[] = [
  { href: '/crew', label: 'Jobs', icon: 'list' },
];

/**
 * The signed-in frame for customers and crew: brand bar on top, content in
 * a single comfortable column, and on phones a tab bar at the bottom where
 * a thumb actually rests. Admin keeps its own wider layout.
 */
export default function AppShell({
  name,
  tabs,
  homeHref,
  children,
  wide = false,
}: {
  name?: string | null;
  tabs: Tab[];
  homeHref: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const showTabs = tabs.length > 1;
  return (
    <div className="min-h-screen bg-surface">
      <header className="sticky top-0 z-40 bg-ink text-white">
        <div className={`mx-auto flex items-center justify-between gap-4 px-5 py-2.5 ${wide ? 'max-w-4xl' : 'max-w-xl md:max-w-3xl'}`}>
          <Link href={homeHref} aria-label="Home" className="shrink-0">
            <Logo variant="light" size="sm" />
          </Link>
          {showTabs && <HeaderTabs tabs={tabs} />}
          <div className="flex items-center gap-3 text-sm">
            {name && <span className="hidden text-white/60 sm:inline">{name}</span>}
            <SignOutButton />
          </div>
        </div>
        {/* The flow line: the logo's gold wave, carried under every screen. */}
        <div className="flow-line" aria-hidden="true" />
      </header>
      <main className={`mx-auto px-5 pb-32 pt-6 md:pb-16 ${wide ? 'max-w-4xl' : 'max-w-xl md:max-w-3xl'}`}>
        <AccessNotice />
        {children}
      </main>
      {showTabs && <BottomTabs tabs={tabs} />}
    </div>
  );
}
