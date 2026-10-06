'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { signOut } from 'next-auth/react';
import Icon from '@/components/Icon';
import { TcIcon } from '@/components/tc/TcLogo';
import type { NavSection, QuickCreate } from '@/lib/adminNav';

type Brand = { name: string; logoUrl: string | null; useBrandLogo: boolean };

const PIN_KEY = 'trashcan.adminRailPinned';

function activeSectionKey(pathname: string, sections: NavSection[]) {
  let best: { key: string; len: number } | undefined;
  for (const s of sections) {
    for (const href of [s.href, ...s.pages.map((p) => p.href)]) {
      const hit = pathname === href || (href !== '/admin' && pathname.startsWith(href + '/'));
      if (hit && (!best || href.length > best.len)) best = { key: s.key, len: href.length };
    }
  }
  return best?.key;
}

const initialsOf = (name: string) =>
  name
    .replace(/\(.*?\)/g, '')
    .replace(/[^\p{L}\s]/gu, '')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

/** The company's own mark at the top of the rail: its logo, or its initials. */
function CompanyMark({ brand, wide }: { brand: Brand; wide: boolean }) {
  const logo = brand.useBrandLogo ? '/brand/logo-light-mark.png' : brand.logoUrl;
  if (wide) {
    return (
      <span className="flex min-w-0 items-center gap-2.5">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="" className="h-7 w-auto max-w-[120px] object-contain" />
        ) : (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-tc-black-3 font-tc-display text-[13px] font-extrabold text-white">
            {initialsOf(brand.name)}
          </span>
        )}
        {!logo && <span className="truncate font-tc-display text-[15px] font-bold text-white">{brand.name}</span>}
      </span>
    );
  }
  return (
    <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-[11px] bg-tc-black-3 font-tc-display text-[13px] font-extrabold text-white ring-1 ring-white/10">
      {brand.useBrandLogo ? '3U3' : brand.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={brand.logoUrl} alt="" className="h-7 w-7 object-contain" />
      ) : (
        initialsOf(brand.name)
      )}
    </span>
  );
}

function useDismiss(open: boolean, close: () => void, ref: React.RefObject<HTMLElement>) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close, ref]);
}

/**
 * The owner's workspace frame (TRASHCAN guide §5): a dark, compact rail
 * whose labels slide out on hover (or stay open when pinned), the lime
 * "New" action, and a bright workspace with a top bar for search, alerts
 * and the account menu. On a phone: a bottom tab bar with "New" under the
 * thumb. The company's own name and logo sit at the top of the rail —
 * TRASHCAN is the frame, the business is the subject.
 */
export default function AdminShell({
  sections,
  quickCreate,
  brand,
  userName,
  unreadCount = 0,
  planLabel,
  children,
}: {
  sections: NavSection[];
  quickCreate: QuickCreate[];
  brand: Brand;
  userName: string;
  unreadCount?: number;
  planLabel?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [pinned, setPinned] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [query, setQuery] = useState('');
  const newRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      setPinned(localStorage.getItem(PIN_KEY) === '1');
    } catch {
      /* private window — stay collapsed */
    }
  }, []);
  useEffect(() => {
    setNewOpen(false);
    setMoreOpen(false);
    setUserOpen(false);
  }, [pathname]);
  useDismiss(newOpen, () => setNewOpen(false), newRef);
  useDismiss(userOpen, () => setUserOpen(false), userRef);
  // "/" focuses search, the way most operations tools work.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) && !t.isContentEditable) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const togglePin = () => {
    setPinned((p) => {
      try {
        localStorage.setItem(PIN_KEY, p ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !p;
    });
  };

  const activeKey = activeSectionKey(pathname, sections);
  const active = sections.find((s) => s.key === activeKey);
  const subPages = active?.pages ?? [];
  const activePage = subPages
    .filter((p) => pathname === p.href || (p.href !== '/admin' && pathname.startsWith(p.href + '/')))
    .sort((a, b) => b.href.length - a.href.length)[0];

  const groups = Array.from(new Set(sections.map((s) => s.group)));
  const railWidth = pinned ? 'w-[248px]' : 'w-[72px]';
  const mainOffset = pinned ? 'md:pl-[248px]' : 'md:pl-[72px]';
  const mobileTabs = ['home', 'schedule', 'clients'].map((k) => sections.find((s) => s.key === k)).filter(Boolean) as NavSection[];
  const canBill = sections.some((s) => s.pages.some((p) => p.href === '/admin/plan'));

  return (
    <div className="theme-tc min-h-screen bg-[#F6F7F9] text-tc-900">
      <a href="#workspace" className="sr-only z-[60] rounded-lg bg-tc-lime px-4 py-2 font-semibold text-tc-black focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Skip to content
      </a>

      {/* ---- Desktop rail ---------------------------------------------- */}
      <aside
        className={`tc-dark fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-white/[0.06] bg-tc-black py-3 transition-[width] duration-200 ease-tc-out md:flex ${railWidth}`}
        aria-label="Workspace sections"
      >
        <div className={`mb-3 flex h-12 items-center ${pinned ? 'px-4' : 'justify-center'}`}>
          <Link href="/admin" aria-label={`${brand.name} — Home`} className="rounded-lg">
            <CompanyMark brand={brand} wide={pinned} />
          </Link>
        </div>

        {quickCreate.length > 0 && (
          <div ref={newRef} className={`relative mb-3 ${pinned ? 'px-3' : 'flex justify-center'}`}>
            <button
              type="button"
              onClick={() => setNewOpen((o) => !o)}
              aria-expanded={newOpen}
              aria-haspopup="menu"
              className={`rail-item group h-11 rounded-tc-md bg-tc-lime text-tc-black transition-colors hover:bg-tc-lime-hover ${pinned ? 'w-full justify-start gap-2.5 px-3.5' : 'w-11 justify-center'}`}
            >
              <Icon name="plus" size={20} />
              {pinned ? <span className="text-[14px] font-bold">New</span> : <span className="rail-label">New</span>}
            </button>
            {newOpen && (
              <div role="menu" className="absolute left-full top-0 z-50 ml-3 w-80 animate-tc-rise rounded-tc-lg border border-tc-200 bg-white p-2 text-tc-900 shadow-tc-lg">
                <p className="px-3 pb-1 pt-2 text-[12px] font-semibold text-tc-500">Create</p>
                {quickCreate.map((q) => (
                  <Link
                    key={q.href}
                    href={q.href}
                    role="menuitem"
                    className="flex items-start gap-3 rounded-tc-md px-3 py-2.5 hover:bg-tc-100 focus-visible:bg-tc-100 focus-visible:outline-none"
                  >
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-tc-black text-tc-lime">
                      <Icon name={q.icon} size={17} />
                    </span>
                    <span>
                      <span className="block text-[14px] font-semibold">{q.label}</span>
                      <span className="block text-[12px] text-tc-500">{q.detail}</span>
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        <nav className={`flex-1 ${pinned ? 'overflow-y-auto' : 'overflow-visible'}`}>
          {groups.map((g, gi) => (
            <div key={g}>
              {gi > 0 && <div className={`my-2.5 h-px bg-white/[0.08] ${pinned ? 'mx-4' : 'mx-5'}`} />}
              <ul className={`space-y-0.5 ${pinned ? 'px-3' : 'flex flex-col items-center'}`}>
                {sections
                  .filter((s) => s.group === g)
                  .map((s) => {
                    const isActive = s.key === activeKey;
                    return (
                      <li key={s.key}>
                        <Link
                          href={s.href}
                          aria-current={isActive ? 'page' : undefined}
                          className={`rail-item group h-10 rounded-[10px] ${pinned ? 'w-full justify-start gap-3 px-3' : 'w-11 justify-center'} ${
                            isActive ? 'bg-tc-lime/[0.12] text-tc-lime' : 'text-white/55 hover:bg-white/[0.06] hover:text-white'
                          }`}
                        >
                          <Icon name={s.icon} size={20} />
                          {pinned ? <span className="truncate text-[14px] font-semibold">{s.label}</span> : <span className="rail-label">{s.label}</span>}
                        </Link>
                      </li>
                    );
                  })}
              </ul>
            </div>
          ))}
        </nav>

        <div className={`mt-3 space-y-1 ${pinned ? 'px-3' : 'flex flex-col items-center'}`}>
          <button
            type="button"
            onClick={togglePin}
            className={`rail-item group h-10 rounded-[10px] text-white/45 hover:bg-white/[0.06] hover:text-white ${pinned ? 'w-full justify-start gap-3 px-3' : 'w-11 justify-center'}`}
            aria-pressed={pinned}
          >
            <Icon name={pinned ? 'chevron' : 'menu'} size={18} className={pinned ? 'rotate-180' : ''} />
            {pinned ? <span className="text-[13px] font-semibold">Collapse</span> : <span className="rail-label">Keep labels open</span>}
          </button>
          <div className={`flex items-center gap-2 pt-2 text-white/35 ${pinned ? 'px-3' : 'justify-center'}`} title="Runs on TRASHCAN">
            <TcIcon size={16} color="rgba(255,255,255,0.35)" />
            {pinned && <span className="text-[11px] font-semibold tracking-wide">Runs on TRASHCAN</span>}
          </div>
        </div>
      </aside>

      {/* ---- Top bar ---------------------------------------------------- */}
      <div className={`transition-[padding] duration-200 ease-tc-out ${mainOffset}`}>
        <header className="sticky top-0 z-30 border-b border-tc-200 bg-white/90 backdrop-blur-md">
          <div className="flex h-16 items-center justify-between gap-4 px-4 md:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <Link href="/admin" className="md:hidden" aria-label={`${brand.name} — Home`}>
                <CompanyMark brand={brand} wide={false} />
              </Link>
              <h1 className="truncate font-tc-display text-[19px] font-bold tracking-[-0.02em]">{active?.label ?? 'Workspace'}</h1>
            </div>

            <div className="flex items-center gap-2">
              <form
                role="search"
                className="relative hidden lg:block"
                onSubmit={(e) => {
                  e.preventDefault();
                  const q = query.trim();
                  if (q) router.push(`/admin/clients?q=${encodeURIComponent(q)}`);
                }}
              >
                <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-tc-500" />
                <input
                  ref={searchRef}
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search clients by name, phone or email"
                  aria-label="Search clients"
                  className="h-10 w-[300px] rounded-[10px] border border-tc-200 bg-tc-50 pl-9 pr-9 text-[14px] text-tc-900 placeholder:text-tc-500 focus:border-tc-black focus:bg-white focus:outline-none focus:shadow-[0_0_0_4px_rgba(184,255,0,0.45)]"
                />
                <span className="tc-kbd pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2">/</span>
              </form>

              <Link
                href="/admin/notifications"
                className="relative flex h-10 w-10 items-center justify-center rounded-[10px] text-tc-700 hover:bg-tc-100 hover:text-tc-black"
                aria-label={unreadCount ? `Alerts, ${unreadCount} unread` : 'Alerts'}
              >
                <Icon name="bell" size={20} />
                {unreadCount > 0 && (
                  <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-tc-black px-1 text-[10px] font-bold text-tc-lime ring-2 ring-white">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </Link>

              <div ref={userRef} className="relative">
                <button
                  type="button"
                  onClick={() => setUserOpen((o) => !o)}
                  aria-expanded={userOpen}
                  aria-haspopup="menu"
                  className="flex h-10 items-center gap-2 rounded-[10px] pl-1 pr-2 hover:bg-tc-100"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-tc-black font-tc-display text-[12px] font-extrabold text-tc-lime">
                    {initialsOf(userName || brand.name)}
                  </span>
                  <span className="hidden max-w-[140px] truncate text-[14px] font-semibold sm:inline">{userName.split(' ')[0]}</span>
                  <Icon name="chevron" size={14} className="hidden rotate-90 text-tc-500 sm:block" />
                </button>
                {userOpen && (
                  <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-64 animate-tc-rise rounded-tc-lg border border-tc-200 bg-white p-1.5 shadow-tc-lg">
                    <div className="px-3 pb-2 pt-2">
                      <p className="truncate text-[14px] font-semibold">{userName}</p>
                      <p className="truncate text-[12px] text-tc-500">{brand.name}{planLabel ? ` · ${planLabel}` : ''}</p>
                    </div>
                    <div className="my-1 h-px bg-tc-100" />
                    {canBill && (
                      <Link role="menuitem" href="/admin/plan" className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[14px] hover:bg-tc-100">
                        <Icon name="wallet" size={17} /> Plan & credits
                      </Link>
                    )}
                    <Link role="menuitem" href="/security" className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[14px] hover:bg-tc-100">
                      <Icon name="shield" size={17} /> Sign-in & security
                    </Link>
                    <Link role="menuitem" href="/admin/help" className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[14px] hover:bg-tc-100">
                      <Icon name="help" size={17} /> Help & SOPs
                    </Link>
                    <div className="my-1 h-px bg-tc-100" />
                    <button role="menuitem" onClick={() => signOut({ callbackUrl: '/' })} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[14px] hover:bg-tc-100">
                      <Icon name="logout" size={17} /> Sign out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
          {subPages.length > 1 && (
            <nav className="-mb-px flex gap-5 overflow-x-auto px-4 md:px-8 [scrollbar-width:none]" aria-label={`${active?.label} pages`}>
              {subPages.map((p) => {
                const on = p === activePage;
                return (
                  <Link
                    key={p.href}
                    href={p.href}
                    aria-current={on ? 'page' : undefined}
                    className={`whitespace-nowrap border-b-2 pb-2.5 pt-1 text-[14px] font-semibold transition-colors ${
                      on ? 'border-tc-black text-tc-black' : 'border-transparent text-tc-500 hover:border-tc-300 hover:text-tc-900'
                    }`}
                  >
                    {p.label}
                  </Link>
                );
              })}
            </nav>
          )}
        </header>

        <main id="workspace" className="mx-auto max-w-[1280px] px-4 pb-28 pt-6 md:px-8 md:pb-12 md:pt-8">
          {children}
        </main>
      </div>

      {/* ---- Phone tab bar ---------------------------------------------- */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-tc-200 bg-white/95 backdrop-blur md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        aria-label="Workspace sections"
      >
        <div className="grid grid-cols-5 items-end">
          {mobileTabs.slice(0, 2).map((s) => (
            <MobileTab key={s.key} section={s} active={s.key === activeKey} />
          ))}
          <div className="flex justify-center pb-2">
            <button
              type="button"
              onClick={() => {
                setMoreOpen(false);
                if (quickCreate.length === 1) router.push(quickCreate[0].href);
                else setNewOpen((o) => !o);
              }}
              aria-label="New"
              aria-expanded={newOpen}
              className="-mt-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-tc-black text-tc-lime shadow-tc-lg"
            >
              <Icon name="plus" size={24} />
            </button>
          </div>
          {mobileTabs.slice(2, 3).map((s) => (
            <MobileTab key={s.key} section={s} active={s.key === activeKey} />
          ))}
          <button
            type="button"
            onClick={() => {
              setNewOpen(false);
              setMoreOpen((o) => !o);
            }}
            aria-expanded={moreOpen}
            className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${moreOpen ? 'text-tc-black' : 'text-tc-500'}`}
          >
            <Icon name="more" />
            More
          </button>
        </div>
      </nav>

      {(moreOpen || newOpen) && (
        <div className="fixed inset-0 z-30 bg-tc-black/40 md:hidden" onClick={() => { setMoreOpen(false); setNewOpen(false); }}>
          <div
            className="absolute inset-x-0 bottom-16 max-h-[72vh] animate-tc-rise overflow-y-auto rounded-t-[22px] bg-white p-4 pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="mx-auto mb-3 block h-1 w-10 rounded-full bg-tc-200" aria-hidden="true" />
            {newOpen ? (
              <>
                <p className="px-2 pb-2 text-[12px] font-semibold text-tc-500">Create</p>
                {quickCreate.map((q) => (
                  <Link key={q.href} href={q.href} className="flex min-h-[56px] items-center gap-3 rounded-tc-md px-2 py-2 hover:bg-tc-100">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-tc-black text-tc-lime">
                      <Icon name={q.icon} size={19} />
                    </span>
                    <span>
                      <span className="block text-[15px] font-semibold">{q.label}</span>
                      <span className="block text-[13px] text-tc-500">{q.detail}</span>
                    </span>
                  </Link>
                ))}
              </>
            ) : (
              <>
                <form
                  role="search"
                  className="relative mb-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const q = query.trim();
                    if (q) router.push(`/admin/clients?q=${encodeURIComponent(q)}`);
                  }}
                >
                  <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-tc-500" />
                  <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search clients" aria-label="Search clients" className="tc-input pl-9" />
                </form>
                <div className="grid grid-cols-3 gap-2">
                  {sections.map((s) => (
                    <Link
                      key={s.key}
                      href={s.href}
                      className={`flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-tc-md px-2 py-3 text-center text-[12px] font-semibold ${
                        s.key === activeKey ? 'bg-tc-black text-tc-lime' : 'bg-tc-50 text-tc-700 hover:bg-tc-100'
                      }`}
                    >
                      <Icon name={s.icon} />
                      {s.label}
                    </Link>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MobileTab({ section, active }: { section: NavSection; active: boolean }) {
  return (
    <Link
      href={section.href}
      aria-current={active ? 'page' : undefined}
      className={`relative flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${active ? 'text-tc-black' : 'text-tc-500'}`}
    >
      {active && <span aria-hidden="true" className="absolute top-0 h-0.5 w-8 rounded-full bg-tc-black" />}
      <Icon name={section.icon} />
      {section.label}
    </Link>
  );
}
