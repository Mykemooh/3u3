'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type Tab = { href: string; label: string; icon: 'home' | 'calendar' | 'receipt' | 'list' | 'grid' };

const ICONS: Record<Tab['icon'], JSX.Element> = {
  home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9.5Z" />,
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </>
  ),
  receipt: <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Zm3 5h6M9 12h6" />,
  list: <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />,
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
};

function isActive(pathname: string, href: string, all: Tab[]) {
  if (pathname === href) return true;
  // The longest matching prefix wins, so /account/invoices lights up
  // "Invoices" rather than "Home".
  const matches = all.filter((t) => pathname.startsWith(`${t.href}/`) || pathname === t.href);
  const best = matches.sort((a, b) => b.href.length - a.href.length)[0];
  return best?.href === href;
}

/** Desktop: inline tabs in the header. */
export function HeaderTabs({ tabs }: { tabs: Tab[] }) {
  const pathname = usePathname();
  return (
    <nav className="hidden items-center gap-1 md:flex" aria-label="Sections">
      {tabs.map((t) => {
        const active = isActive(pathname, t.href, tabs);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? 'page' : undefined}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
              active ? 'bg-white/10 text-gold' : 'text-white/70 hover:bg-white/10 hover:text-white'
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Phone: a tab bar within thumb reach, clear of the home indicator. */
export function BottomTabs({ tabs }: { tabs: Tab[] }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Sections"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 backdrop-blur md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto grid max-w-xl" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
        {tabs.map((t) => {
          const active = isActive(pathname, t.href, tabs);
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold ${active ? 'text-bronze' : 'text-muted'}`}
            >
              <svg
                viewBox="0 0 24 24"
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                strokeWidth={active ? 2.2 : 1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                {ICONS[t.icon]}
              </svg>
              {t.label}
              <span className={`mt-0.5 h-0.5 w-5 rounded-full ${active ? 'bg-gold' : 'bg-transparent'}`} />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
