'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Logo from '@/components/Logo';

type NavLink = { href: string; label: string };

export default function MobileNav({
  links,
  signedIn,
  accountHref,
  accountLabel,
}: {
  links: NavLink[];
  signedIn: boolean;
  accountHref: string;
  accountLabel: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        className="flex h-11 w-11 items-center justify-center rounded-xl text-ink"
      >
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-white" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="flex items-center justify-between px-6 py-4">
            <Logo size="sm" />
            <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="flex h-11 w-11 items-center justify-center rounded-xl text-ink">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          <nav className="flex flex-1 flex-col gap-1 px-6 py-6">
            {links.map((link, i) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="border-b border-line py-4 text-3xl font-bold tracking-[-0.02em] text-ink transition-opacity"
                style={{ animation: `mobile-nav-in 0.35s ease-out ${i * 0.05}s both` }}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="flex flex-col gap-3 px-6 pb-10">
            <Link href={signedIn ? accountHref : '/new'} onClick={() => setOpen(false)} className="btn-primary w-full">
              {signedIn ? accountLabel : 'Get a free quote'}
            </Link>
            {!signedIn && (
              <Link href="/signin" onClick={() => setOpen(false)} className="btn-secondary w-full">
                Sign in
              </Link>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes mobile-nav-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes mobile-nav-in { from { opacity: 1; transform: none; } to { opacity: 1; transform: none; } }
        }
      `}</style>
    </div>
  );
}
