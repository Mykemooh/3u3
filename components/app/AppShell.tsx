import Link from 'next/link';
import Logo from '@/components/Logo';
import SignOutButton from '@/components/SignOutButton';
import AccessNotice from '@/components/AccessNotice';
import { BottomTabs, HeaderTabs, type Tab } from '@/components/app/TabBar';
import LocaleProvider from '@/components/i18n/LocaleProvider';
import LanguageToggle from '@/components/i18n/LanguageToggle';
import { getLocale } from '@/lib/i18n/server';
import { translator } from '@/lib/i18n';
import { shellMessages } from '@/lib/i18n/messages/shell';

export const CUSTOMER_TABS: Tab[] = [
  { href: '/account', label: 'tabHome', icon: 'home' },
  { href: '/book', label: 'tabBook', icon: 'calendar' },
  { href: '/account/invoices', label: 'tabInvoices', icon: 'receipt' },
  { href: '/help', label: 'tabHelp', icon: 'help' },
];

export const CREW_TABS: Tab[] = [
  { href: '/crew', label: 'tabJobs', icon: 'list' },
  { href: '/crew/help', label: 'tabHowTo', icon: 'help' },
];

/**
 * The signed-in frame for customers and crew: brand bar on top, content in
 * a single comfortable column, and on phones a tab bar at the bottom where
 * a thumb actually rests. Admin keeps its own wider layout.
 *
 * Also where English/Spanish starts for these areas: it decides the
 * request's language, hands it to every client component below
 * (LocaleProvider), and puts the EN | ES toggle in the header. Tab labels
 * above are keys into lib/i18n/messages/shell.ts.
 */
export default async function AppShell({
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
  const locale = await getLocale();
  const t = translator(shellMessages, locale);
  const shown = tabs.map((tab) => ({ ...tab, label: tab.label in shellMessages.en ? t(tab.label as keyof typeof shellMessages.en) : tab.label }));
  return (
    <LocaleProvider locale={locale}>
    <div className="min-h-screen bg-surface" lang={locale}>
      <header className="sticky top-0 z-40 bg-ink text-white">
        <div className={`mx-auto flex items-center justify-between gap-4 px-5 py-2.5 ${wide ? 'max-w-4xl' : 'max-w-xl md:max-w-3xl'}`}>
          <Link href={homeHref} aria-label={t('home')} className="shrink-0">
            <Logo variant="light" size="sm" />
          </Link>
          {showTabs && <HeaderTabs tabs={shown} label={t('sections')} />}
          <div className="flex items-center gap-3 text-sm">
            {name && <span className="hidden text-white/60 sm:inline">{name}</span>}
            <LanguageToggle />
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
      {showTabs && <BottomTabs tabs={shown} label={t('sections')} />}
    </div>
    </LocaleProvider>
  );
}
