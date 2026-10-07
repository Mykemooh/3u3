'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type Tab = { href: string; label: string; icon: 'home' | 'calendar' | 'receipt' | 'list' | 'grid' | 'help' };

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
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5h.01" />
    </>
  ),
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

/** Desktop: inline tabs in the header. `tone="dark"` is the cleaner app's black header. */
export function HeaderTabs({ tabs, label = 'Sections', tone = 'light' }: { tabs: Tab[]; label?: string; tone?: 'light' | 'dark' }) {
  const pathname = usePathname();
  const on = tone === 'dark' ? 'bg-white/10 text-white' : 'bg-surface text-ink';
  const off = tone === 'dark' ? 'text-white/60 hover:bg-white/[0.06] hover:text-white' : 'text-muted hover:bg-surface hover:text-ink';
  return (
    <nav className="hidden items-center gap-1 md:flex" aria-label={label}>
      {tabs.map((t) => {
        const active = isActive(pathname, t.href, tabs);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? 'page' : undefined}
            className={`rounded-[10px] px-3 py-2 text-[15px] font-semibold transition-colors ${active ? on : off}`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Phone: a tab bar within thumb reach, clear of the home indicator.
 * `tone="dark"` (the cleaner app) is a black dock, a fixed 64px tall, so a
 * page's own action bar can sit right on top of it (components/CrewJob.tsx).
 * `data-tex-avoid` tells the Tex bubble to stay above it.
 */
export function BottomTabs({ tabs, label = 'Sections', tone = 'light' }: { tabs: Tab[]; label?: string; tone?: 'light' | 'dark' }) {
  const pathname = usePathname();
  const dark = tone === 'dark';
  return (
    <nav
      aria-label={label}
      data-tex-avoid=""
      className={`fixed inset-x-0 bottom-0 z-40 md:hidden ${dark ? 'tc-dark border-t border-white/[0.08] bg-tc-black' : 'border-t border-line bg-white/95 backdrop-blur'}`}
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto grid max-w-xl" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
        {tabs.map((t) => {
          const active = isActive(pathname, t.href, tabs);
          const color = dark ? (active ? 'text-white' : 'text-white/50') : active ? 'text-ink' : 'text-muted';
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-col items-center justify-center gap-1 px-1 text-center text-[12px] font-semibold leading-tight ${
                dark ? 'h-16 pt-1.5' : 'min-h-[60px] pb-1.5 pt-2'
              } ${color}`}
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
              <span
                className={`h-[3px] w-5 rounded-full ${active ? (dark ? 'bg-tc-lime' : 'tab-indicator bg-gold') : 'bg-transparent'}`}
                aria-hidden="true"
              />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
