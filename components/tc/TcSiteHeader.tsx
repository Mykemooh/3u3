'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import TcLogo from '@/components/tc/TcLogo';
import type { TcNav } from '@/lib/tc/site';

/**
 * TrashCan's site header — the same bar on every TrashCan page (marketing,
 * signup, legal, status). `tone="dark"` sits over a dark hero; it turns
 * solid once the page scrolls so links never sit on busy content.
 */
export default function TcSiteHeader({ nav, tone = 'light', minimal = false }: { nav: TcNav; tone?: 'light' | 'dark'; minimal?: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [open]);

  const dark = tone === 'dark';
  const links = [
    { href: nav.features, label: 'Features' },
    { href: nav.pricing, label: 'Pricing' },
    { href: nav.resources, label: 'Resources' },
  ];
  const isActive = (href: string) => pathname === href || (href !== nav.home && pathname.startsWith(`${href}/`));

  return (
    <header
      className={`sticky top-0 z-50 transition-colors duration-200 ${
        dark
          ? scrolled || open
            ? 'border-b border-white/10 bg-tc-black/90 backdrop-blur-md'
            : 'border-b border-transparent bg-tc-black'
          : scrolled || open
            ? 'border-b border-tc-200 bg-white/90 backdrop-blur-md'
            : 'border-b border-transparent bg-white'
      }`}
    >
      <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between gap-6 px-4 sm:px-6 lg:px-8">
        <Link href={nav.home} aria-label="TRASHCAN home" className="rounded-md focus-visible:outline-offset-4">
          <TcLogo on={dark ? 'dark' : 'light'} />
        </Link>

        {!minimal && (
          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                aria-current={isActive(l.href) ? 'page' : undefined}
                className={`rounded-lg px-3 py-2 text-[14px] font-semibold transition-colors ${
                  dark
                    ? isActive(l.href) ? 'text-white' : 'text-white/65 hover:text-white'
                    : isActive(l.href) ? 'text-tc-black' : 'text-tc-700 hover:text-tc-black'
                }`}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        )}

        <div className="flex items-center gap-2">
          <Link
            href="/signin?platform=1"
            className={`hidden rounded-lg px-3 py-2 text-[14px] font-semibold sm:inline-flex ${dark ? 'text-white/80 hover:text-white' : 'text-tc-700 hover:text-tc-black'}`}
          >
            Log in
          </Link>
          {!minimal && (
            <Link href="/start" className="tc-btn-lime tc-btn-sm hidden sm:inline-flex">
              Get started free
            </Link>
          )}
          {!minimal && (
            <button
              type="button"
              className={`inline-flex h-11 w-11 items-center justify-center rounded-lg md:hidden ${dark ? 'text-white hover:bg-white/10' : 'text-tc-black hover:bg-tc-100'}`}
              aria-expanded={open}
              aria-controls="tc-mobile-menu"
              aria-label={open ? 'Close menu' : 'Open menu'}
              onClick={() => setOpen((o) => !o)}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
              </svg>
            </button>
          )}
        </div>
      </div>

      {open && !minimal && (
        <div id="tc-mobile-menu" className={`border-t md:hidden ${dark ? 'border-white/10 bg-tc-black' : 'border-tc-200 bg-white'}`}>
          <nav aria-label="Mobile" className="mx-auto max-w-[1280px] px-4 pb-6 pt-2">
            <ul>
              {links.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className={`flex min-h-[52px] items-center justify-between border-b text-[17px] font-semibold ${
                      dark ? 'border-white/10 text-white' : 'border-tc-100 text-tc-black'
                    }`}
                  >
                    {l.label}
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/signin?platform=1" className={`flex min-h-[52px] items-center text-[17px] font-semibold ${dark ? 'text-white/80' : 'text-tc-700'}`}>
                  Log in
                </Link>
              </li>
            </ul>
            <Link href="/start" className="tc-btn-lime tc-btn-lg mt-4 w-full">
              Get started free
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
