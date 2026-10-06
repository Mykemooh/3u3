'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { LOCALES, LOCALE_LABELS, type Locale } from '@/lib/i18n';
import { useLocale } from '@/components/i18n/LocaleProvider';

/**
 * EN | ES. Saves the choice (cookie, plus the account when signed in —
 * app/api/locale) and re-renders the page in the new language. Each option
 * is labelled in its own language, so someone who can't read the current
 * one still finds theirs.
 */
export default function LanguageToggle({ tone = 'dark', className = '' }: { tone?: 'dark' | 'light'; className?: string }) {
  const current = useLocale();
  const router = useRouter();
  const [picked, setPicked] = useState<Locale>(current);
  const [pending, startTransition] = useTransition();
  const active = pending ? picked : current;

  async function choose(locale: Locale) {
    if (locale === active) return;
    setPicked(locale);
    const res = await fetch('/api/locale', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale }),
    }).catch(() => null);
    if (!res?.ok) {
      setPicked(current);
      return;
    }
    startTransition(() => router.refresh());
  }

  const frame = tone === 'dark' ? 'border-white/20 bg-white/5' : 'border-line bg-white';
  const on = tone === 'dark' ? 'bg-white text-ink' : 'bg-ink text-white';
  const off = tone === 'dark' ? 'text-white/70 hover:text-white' : 'text-muted hover:text-ink';

  return (
    <div role="group" aria-label="Language / Idioma" className={`inline-flex items-center rounded-full border p-0.5 text-xs font-semibold ${frame} ${className}`}>
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={active === l}
          aria-label={LOCALE_LABELS[l].name}
          title={LOCALE_LABELS[l].name}
          disabled={pending}
          onClick={() => choose(l)}
          className={`min-w-[2.25rem] rounded-full px-2.5 py-1 transition ${active === l ? on : off}`}
        >
          {LOCALE_LABELS[l].short}
        </button>
      ))}
    </div>
  );
}
