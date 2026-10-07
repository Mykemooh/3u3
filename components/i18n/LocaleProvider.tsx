'use client';

import { createContext, useContext, useMemo } from 'react';
import { DEFAULT_LOCALE, translator, type Locale, type MessageBook, type Messages } from '@/lib/i18n';

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

/**
 * Hands the request's language (decided on the server, lib/i18n/server.ts)
 * to client components. Wrapped around each translated area by its shell
 * (AppShell, the sign-in page), never the whole site, so pages that aren't
 * translated yet keep rendering statically.
 */
export default function LocaleProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

/** t() for one area's words in the current language: const t = useT(crewMessages). */
export function useT<M extends Messages>(book: MessageBook<M>) {
  const locale = useLocale();
  return useMemo(() => translator(book, locale), [book, locale]);
}
