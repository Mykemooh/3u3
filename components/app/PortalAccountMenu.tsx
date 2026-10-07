'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { signOut } from 'next-auth/react';
import { useT } from '@/components/i18n/LocaleProvider';
import { shellMessages } from '@/lib/i18n/messages/shell';

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

/**
 * The person's menu at the right of the portal header — the same shape as
 * the owner workspace's: who you are and for which company, then settings,
 * sign-in security, help and sign out.
 */
export default function PortalAccountMenu({
  name,
  company,
  settingsHref,
  helpHref,
  tone,
}: {
  name: string;
  company: string;
  settingsHref?: string;
  helpHref: string;
  tone: 'crew' | 'client';
}) {
  const t = useT(shellMessages);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const avatar = tone === 'crew' ? 'bg-tc-black text-tc-lime font-tc-display' : 'bg-ink text-white font-display';
  const item = 'flex items-center gap-2.5 rounded-lg px-3 py-2 text-[14px] text-ink hover:bg-surface';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('accountMenu')}
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 items-center gap-2 rounded-[10px] pl-1 pr-1 hover:bg-surface sm:pr-2"
      >
        <span className={`flex h-8 w-8 items-center justify-center rounded-full text-[12px] font-extrabold ${avatar}`}>{initialsOf(name) || '·'}</span>
        <span className="hidden max-w-[140px] truncate text-[14px] font-semibold text-ink sm:inline">{name.split(' ')[0]}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="hidden text-muted sm:block" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-64 rounded-2xl border border-line bg-white p-1.5 shadow-card-lg">
          <div className="px-3 pb-2 pt-2">
            <p className="truncate text-[14px] font-semibold text-ink">{name}</p>
            <p className="truncate text-[12px] text-muted">{company}</p>
          </div>
          <div className="my-1 h-px bg-line" />
          {settingsHref && (
            <Link role="menuitem" href={settingsHref} className={item} onClick={() => setOpen(false)}>
              {t('menuSettings')}
            </Link>
          )}
          <Link role="menuitem" href="/security" className={item} onClick={() => setOpen(false)}>
            {t('menuSecurity')}
          </Link>
          <Link role="menuitem" href={helpHref} className={item} onClick={() => setOpen(false)}>
            {t('menuHelp')}
          </Link>
          <div className="my-1 h-px bg-line" />
          <button role="menuitem" type="button" onClick={() => signOut({ callbackUrl: '/' })} className={`${item} w-full text-left`}>
            {t('signOut')}
          </button>
        </div>
      )}
    </div>
  );
}
