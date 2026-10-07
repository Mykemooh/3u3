import Link from 'next/link';
import Logo from '@/components/Logo';
import AccessNotice from '@/components/AccessNotice';
import { BottomTabs, HeaderTabs, type Tab } from '@/components/app/TabBar';
import PortalAccountMenu from '@/components/app/PortalAccountMenu';
import LocaleProvider from '@/components/i18n/LocaleProvider';
import LanguageToggle from '@/components/i18n/LanguageToggle';
import CompanyBrandProvider from '@/components/brand/CompanyBrandProvider';
import { BrandVars } from '@/components/brand/CompanyBrandFrame';
import { TcIcon } from '@/components/tc/TcLogo';
import { getLocale } from '@/lib/i18n/server';
import { translator } from '@/lib/i18n';
import { shellMessages } from '@/lib/i18n/messages/shell';
import { getTenant } from '@/lib/data';
import { companyBrand } from '@/lib/brand';

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
 * The signed-in frame for clients and cleaners, built like the owner
 * workspace's top bar (components/admin/AdminShell.tsx): a white sticky
 * header with the mark on the left, the sections, and the person's menu on
 * the right; on phones a tab bar at the bottom where a thumb rests.
 *
 * Two looks, by who the screens are for:
 *   crew   — TrashCan's own look (.theme-tc, docs/brand/trashcan-guidelines.md),
 *            like the workspace: it's the tool the company's team works in.
 *   client — the cleaning company's own brand (lib/brand.ts): its colours,
 *            its logo, and a quiet "Powered by TrashCan" at the foot.
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
  variant,
}: {
  name?: string | null;
  tabs: Tab[];
  homeHref: string;
  children: React.ReactNode;
  wide?: boolean;
  variant?: 'crew' | 'client';
}) {
  const look = variant ?? (tabs === CREW_TABS ? 'crew' : 'client');
  const showTabs = tabs.length > 1;
  const [locale, tenant] = await Promise.all([getLocale(), getTenant()]);
  const t = translator(shellMessages, locale);
  const shown = tabs.map((tab) => ({ ...tab, label: tab.label in shellMessages.en ? t(tab.label as keyof typeof shellMessages.en) : tab.label }));
  const brand = companyBrand(tenant ?? { name: '3U3 Cleaning' });
  const column = wide ? 'max-w-4xl' : 'max-w-xl md:max-w-3xl';

  const mark =
    look === 'crew' ? (
      <span className="flex min-w-0 items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-white/[0.08] ring-1 ring-inset ring-white/10">
          <TcIcon size={20} />
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block truncate font-tc-display text-[15px] font-bold tracking-[-0.01em] text-white">{brand.name}</span>
          <span className="block text-[12px] font-semibold text-white/55">{t('crewApp')}</span>
        </span>
      </span>
    ) : (
      <Logo variant="dark" size="sm" wrap />
    );

  return (
    <LocaleProvider locale={locale}>
      <CompanyBrandProvider brand={brand}>
        {look === 'client' && <BrandVars brand={brand} />}
        <div
          lang={locale}
          className={`min-h-screen ${look === 'crew' ? 'portal-crew theme-tc overflow-x-clip bg-tc-100 text-tc-900' : 'portal-client bg-surface'}`}
        >
          <header
            className={
              look === 'crew'
                ? 'tc-dark sticky top-0 z-40 border-b border-white/[0.06] bg-tc-black'
                : 'sticky top-0 z-40 border-b border-line bg-white/90 backdrop-blur-md'
            }
          >
            <div className={`mx-auto flex h-16 items-center justify-between gap-3 px-4 sm:px-5 ${column}`}>
              <Link href={homeHref} aria-label={t('home')} className="min-w-0 shrink rounded-lg">
                {mark}
              </Link>
              {showTabs && <HeaderTabs tabs={shown} label={t('sections')} tone={look === 'crew' ? 'dark' : 'light'} />}
              <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
                <LanguageToggle tone={look === 'crew' ? 'dark' : 'light'} />
                {name && (
                  <PortalAccountMenu
                    name={name}
                    company={brand.name}
                    tone={look}
                    settingsHref={look === 'client' ? '/account/settings' : undefined}
                    helpHref={look === 'crew' ? '/crew/help' : '/help'}
                  />
                )}
              </div>
            </div>
          </header>
          <main className={`mx-auto px-4 sm:px-5 ${look === 'crew' ? 'pb-36 pt-0 md:pb-20' : 'pb-32 pt-6 md:pb-16 md:pt-8'} ${column}`}>
            <AccessNotice />
            {children}
            {look === 'client' && (
              <p className="mt-16 flex items-center justify-center gap-1.5 text-[13px] text-muted">
                {t('poweredBy')}
                <a href="/trashcan" className="inline-flex items-center gap-1 font-semibold text-slate hover:text-ink">
                  <span className="flex h-4 w-4 items-center justify-center rounded bg-tc-black" aria-hidden="true">
                    <TcIcon size={11} />
                  </span>
                  TrashCan
                </a>
              </p>
            )}
          </main>
          {showTabs && <BottomTabs tabs={shown} label={t('sections')} tone={look === 'crew' ? 'dark' : 'light'} />}
        </div>
      </CompanyBrandProvider>
    </LocaleProvider>
  );
}
