'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { LOCALES, LOCALE_LABELS, type Locale } from '@/lib/i18n';
import { useLocale, useT } from '@/components/i18n/LocaleProvider';
import { accountMessages } from '@/lib/i18n/messages/account';

/**
 * Settings → Language. Same save as the header's EN | ES toggle
 * (components/i18n/LanguageToggle.tsx → POST /api/locale, which also
 * stores it on the account), so texts and emails follow it too. Each
 * option is written in its own language.
 */
export default function LanguageSetting() {
  const t = useT(accountMessages);
  const current = useLocale();
  const router = useRouter();
  const [picked, setPicked] = useState<Locale>(current);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();
  const active = pending ? picked : current;

  async function choose(locale: Locale) {
    if (locale === active) return;
    setPicked(locale);
    setError(false);
    const res = await fetch('/api/locale', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale }),
    }).catch(() => null);
    if (!res?.ok) {
      setPicked(current);
      setError(true);
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <div>
      <div role="radiogroup" aria-label={t('setLanguage')} className="flex flex-wrap gap-2">
        {LOCALES.map((l) => (
          <button
            key={l}
            type="button"
            role="radio"
            lang={l}
            aria-checked={active === l}
            disabled={pending}
            onClick={() => choose(l)}
            className={`min-h-[44px] rounded-full border px-5 text-[15px] font-semibold transition ${
              active === l ? 'border-ink bg-ink text-white' : 'border-line bg-white text-slate hover:text-ink'
            }`}
          >
            {LOCALE_LABELS[l].name}
          </button>
        ))}
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{t('setLanguageError')}</p>}
    </div>
  );
}
