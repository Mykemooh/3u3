'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { signOut } from 'next-auth/react';
import Icon from '@/components/Icon';
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

function Mark({ brand, wide }: { brand: Brand; wide: boolean }) {
  if (wide) {
    if (brand.useBrandLogo) {
      // eslint-disable-next-line @next/next/no-img-element
      return <img src="/brand/logo-light-mark.png" alt={brand.name} className="h-7 w-auto" />;
    }
    if (brand.logoUrl) {
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={brand.logoUrl} alt={brand.name} className="h-7 w-auto max-w-[150px] object-contain" />;
    }
    return <span className="truncate font-display text-lg font-bold text-white">{brand.name}</span>;
  }
  const initials = brand.useBrandLogo
    ? '3U3'
    : brand.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 3).toUpperCase();
  return (
    <span
      className="flex h-10 w-10 items-center justify-center rounded-2xl font-display text-[13px] font-extrabold tracking-tight text-white"
      style={{ backgroundImage: 'linear-gradient(135deg, #016AEE, #2DBD91)' }}
    >
      {initials}
    </span>
  );
}

/**
 * The admin portal frame. On a computer: a slim icon rail whose labels
 * slide out on hover (or stay open when pinned), a "New" button for the
 * things you create most, and the current section's pages as tabs across
 * the top. On a phone: the same sections in a bottom tab bar, with "New"
 * in the middle where a thumb reaches it.
 */
export default function AdminShell({
  sections,
  quickCreate,
  brand,
  userName,
  children,
}: {
  sections: NavSection[];
  quickCreate: QuickCreate[];
  brand: Brand;
  userName: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [pinned, setPinned] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const newRef = useRef<HTMLDivElement>(null);

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
  }, [pathname]);
  useEffect(() => {
    if (!newOpen) return;
    const close = (e: MouseEvent) => {
      if (newRef.current && !newRef.current.contains(e.target as Node)) setNewOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setNewOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [newOpen]);

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
  const railWidth = pinned ? 'w-60' : 'w-[76px]';
  const mainOffset = pinned ? 'md:pl-60' : 'md:pl-[76px]';

  const mobileTabs = ['home', 'schedule', 'clients'].map((k) => sections.find((s) => s.key === k)).filter(Boolean) as NavSection[];

  return (
    <div className="min-h-screen bg-surface">
      {/* ---- Desktop rail ---------------------------------------------- */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 hidden flex-col bg-ink py-4 transition-[width] duration-200 md:flex ${railWidth}`}
        aria-label="Admin sections"
      >
        <div className={`mb-4 flex items-center ${pinned ? 'px-5' : 'justify-center'}`}>
          <Link href="/admin" aria-label={`${brand.name} home`}>
            <Mark brand={brand} wide={pinned} />
          </Link>
        </div>

        {quickCreate.length > 0 && (
          <div ref={newRef} className={`relative mb-3 ${pinned ? 'px-3' : 'flex justify-center'}`}>
            <button
              type="button"
              onClick={() => setNewOpen((o) => !o)}
              aria-expanded={newOpen}
              aria-haspopup="menu"
              className={`rail-item group ${pinned ? 'w-full justify-start gap-3 px-3' : 'w-11 justify-center'} h-11 rounded-full text-white shadow-gold`}
              style={{ backgroundImage: 'linear-gradient(135deg, #016AEE, #2DBD91)' }}
            >
              <Icon name="plus" size={20} />
              {pinned ? <span className="text-sm font-semibold">New</span> : <span className="rail-label">New</span>}
            </button>
            {newOpen && (
              <div
                role="menu"
                className="absolute left-full top-0 z-50 ml-3 w-72 rounded-2xl border border-line bg-white p-2 shadow-card-lg"
              >
                <p className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">Create</p>
                {quickCreate.map((q) => (
                  <Link
                    key={q.href}
                    href={q.href}
                    role="menuitem"
                    className="flex items-start gap-3 rounded-xl px-3 py-2.5 hover:bg-surface focus-visible:bg-surface focus-visible:outline-none"
                  >
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-green-light text-green">
                      <Icon name={q.icon} size={18} />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold text-ink">{q.label}</span>
                      <span className="block text-xs text-muted">{q.detail}</span>
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        <nav className={`flex-1 ${pinned ? "overflow-y-auto" : "overflow-visible"}`}>
          {groups.map((g, gi) => (
            <div key={g}>
              {gi > 0 && <div className={`my-2 h-px bg-white/10 ${pinned ? 'mx-5' : 'mx-5'}`} />}
              <ul className={`space-y-1 ${pinned ? 'px-3' : 'flex flex-col items-center'}`}>
                {sections
                  .filter((s) => s.group === g)
                  .map((s) => {
                    const isActive = s.key === activeKey;
                    return (
                      <li key={s.key} className="relative">
                        {isActive && (
                          <span
                            aria-hidden="true"
                            className={`absolute top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-gold-light ${pinned ? '-left-1.5' : '-left-2.5'}`}
                          />
                        )}
                        <Link
                          href={s.href}
                          aria-current={isActive ? 'page' : undefined}
                          className={`rail-item group h-11 rounded-xl ${pinned ? 'w-full justify-start gap-3 px-3' : 'w-11 justify-center'} ${
                            isActive ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white'
                          }`}
                        >
                          <Icon name={s.icon} />
                          {pinned ? <span className="truncate text-sm font-semibold">{s.label}</span> : <span className="rail-label">{s.label}</span>}
                        </Link>
                      </li>
                    );
                  })}
              </ul>
            </div>
          ))}
        </nav>

        <div className={`mt-3 ${pinned ? 'px-3' : 'flex justify-center'}`}>
          <button
            type="button"
            onClick={togglePin}
            className={`rail-item group h-10 rounded-xl text-white/50 hover:text-white ${pinned ? 'w-full justify-start gap-3 px-3' : 'w-11 justify-center'}`}
            aria-pressed={pinned}
          >
            <Icon name="pin" size={18} className={pinned ? 'rotate-45' : ''} />
            {pinned ? <span className="text-xs font-semibold">Collapse menu</span> : <span className="rail-label">Keep labels open</span>}
          </button>
        </div>
      </aside>

      {/* ---- Top bar ---------------------------------------------------- */}
      <div className={mainOffset}>
        <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur">
          <div className="flex items-center justify-between gap-4 px-4 py-2.5 md:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <span className="md:hidden">
                <Mark brand={brand} wide={false} />
              </span>
              <h1 className="truncate font-display text-lg font-bold text-ink">{active?.label ?? 'Admin'}</h1>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <span className="hidden text-muted sm:inline">{userName}</span>
              <Link href="/security" className="hidden text-muted hover:text-ink sm:inline" title="Sign-in & security">
                <Icon name="shield" size={18} />
              </Link>
              <button
                onClick={() => signOut({ callbackUrl: '/' })}
                className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-slate hover:border-gold hover:text-bronze"
              >
                Sign out
              </button>
            </div>
          </div>
          {subPages.length > 1 && (
            <nav className="flex gap-1 overflow-x-auto px-4 pb-2 md:px-8" aria-label={`${active?.label} pages`}>
              {subPages.map((p) => {
                const on = p === activePage;
                return (
                  <Link
                    key={p.href}
                    href={p.href}
                    aria-current={on ? 'page' : undefined}
                    className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
                      on ? 'bg-ink text-white' : 'text-slate hover:bg-surface hover:text-ink'
                    }`}
                  >
                    {p.label}
                  </Link>
                );
              })}
            </nav>
          )}
        </header>

        <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 md:px-8 md:pb-12">{children}</main>
      </div>

      {/* ---- Phone tab bar ---------------------------------------------- */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 backdrop-blur md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        aria-label="Admin sections"
      >
        <div className="grid grid-cols-5 items-end">
          {mobileTabs.slice(0, 2).map((s) => (
            <MobileTab key={s.key} section={s} active={s.key === activeKey} />
          ))}
          <div className="flex justify-center pb-2">
            <Link
              href={quickCreate[0]?.href ?? '/admin'}
              onClick={(e) => {
                if (quickCreate.length > 1) {
                  e.preventDefault();
                  setMoreOpen(false);
                  setNewOpen((o) => !o);
                }
              }}
              aria-label="New"
              className="-mt-5 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-gold-lg"
              style={{ backgroundImage: 'linear-gradient(135deg, #016AEE, #2DBD91)' }}
            >
              <Icon name="plus" size={24} />
            </Link>
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
            className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold ${moreOpen ? 'text-bronze' : 'text-muted'}`}
          >
            <Icon name="more" />
            More
          </button>
        </div>
      </nav>

      {(moreOpen || newOpen) && (
        <div className="fixed inset-0 z-30 bg-ink/30 md:hidden" onClick={() => { setMoreOpen(false); setNewOpen(false); }}>
          <div
            className="absolute inset-x-0 bottom-16 max-h-[70vh] overflow-y-auto rounded-t-3xl bg-white p-4 pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            {newOpen ? (
              <>
                <p className="px-2 pb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">Create</p>
                {quickCreate.map((q) => (
                  <Link key={q.href} href={q.href} className="flex items-center gap-3 rounded-xl px-2 py-3 hover:bg-surface">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-green-light text-green">
                      <Icon name={q.icon} size={18} />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold text-ink">{q.label}</span>
                      <span className="block text-xs text-muted">{q.detail}</span>
                    </span>
                  </Link>
                ))}
              </>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {sections.map((s) => (
                  <Link
                    key={s.key}
                    href={s.href}
                    className={`flex flex-col items-center gap-1.5 rounded-2xl px-2 py-3 text-center text-xs font-semibold ${
                      s.key === activeKey ? 'bg-surface text-bronze' : 'text-slate hover:bg-surface'
                    }`}
                  >
                    <Icon name={s.icon} />
                    {s.label}
                  </Link>
                ))}
              </div>
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
      className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold ${active ? 'text-bronze' : 'text-muted'}`}
    >
      <Icon name={section.icon} />
      {section.label}
    </Link>
  );
}
