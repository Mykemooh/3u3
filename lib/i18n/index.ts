/**
 * English and Spanish (docs/i18n.md).
 *
 * Every screen's words live in a message file under lib/i18n/messages/,
 * one per area, with an `en` block and an `es` block side by side. The
 * type below makes the Spanish block carry exactly the English keys, so a
 * missing or misspelt translation fails the typecheck instead of showing a
 * key on screen. A native speaker reviews a whole area by reading one file.
 *
 * This module is shared by server and client code: no server-only imports.
 * The server's "which language is this request?" lives in lib/i18n/server.ts;
 * the client's in components/i18n/LocaleProvider.tsx.
 */

export const LOCALES = ['en', 'es'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

/** The cookie that carries a visitor's choice (signed in or not). */
export const LOCALE_COOKIE = 'tc_lang';

/** What the toggle shows. */
export const LOCALE_LABELS: Record<Locale, { short: string; name: string }> = {
  en: { short: 'EN', name: 'English' },
  es: { short: 'ES', name: 'Español' },
};

export function isLocale(value: unknown): value is Locale {
  return value === 'en' || value === 'es';
}

export function toLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/** For Intl date and number formatting. */
export function intlLocale(locale: Locale): string {
  return locale === 'es' ? 'es-US' : 'en-US';
}

/** The first language in an Accept-Language header we can speak, if any. */
export function fromAcceptLanguage(header: string | null | undefined): Locale | null {
  if (!header) return null;
  const tags = header
    .split(',')
    .map((part) => {
      const [tag, q] = part.trim().split(';q=');
      return { tag: tag.toLowerCase(), q: q ? Number(q) : 1 };
    })
    .filter((t) => t.tag && !Number.isNaN(t.q))
    .sort((a, b) => b.q - a.q);
  for (const { tag } of tags) {
    const base = tag.split('-')[0];
    if (isLocale(base)) return base;
  }
  return null;
}

export type Messages = Record<string, string>;
/** One area's words: Spanish must have every English key, and no others. */
export type MessageBook<M extends Messages> = { en: M; es: { [K in keyof M]: string } };

export function defineMessages<M extends Messages>(book: { en: M; es: { [K in keyof M]: string } }): MessageBook<M> {
  return book;
}

export type Vars = Record<string, string | number | null | undefined>;

/** Fills {name} placeholders. A missing value leaves an empty string, never "{name}". */
export function format(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const v = vars[key];
    return v === null || v === undefined ? '' : String(v);
  });
}

export type Translate<M extends Messages> = (key: keyof M & string, vars?: Vars) => string;

export function translator<M extends Messages>(book: MessageBook<M>, locale: Locale): Translate<M> {
  const dict = (locale === 'es' ? book.es : book.en) as Record<string, string>;
  return (key, vars) => format(dict[key] ?? (book.en as Record<string, string>)[key] ?? key, vars);
}

/**
 * Picks between two forms by count: t(n === 1 ? 'oneJob' : 'manyJobs').
 * Spanish and English both use "one" vs "other", so this is all we need.
 */
export function plural(n: number, one: string, other: string): string {
  return n === 1 ? one : other;
}
