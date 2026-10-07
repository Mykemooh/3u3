import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { sessionUser } from '@/lib/sessionUser';
import { DEFAULT_LOCALE, LOCALE_COOKIE, fromAcceptLanguage, isLocale, translator, type Locale, type MessageBook, type Messages } from '@/lib/i18n';

/**
 * The language for this request, in order of who said it most recently:
 *   1. the toggle's cookie (set the moment someone switches);
 *   2. the signed-in person's saved choice (users.locale) — so a new phone
 *      or a cleared browser still opens in their language;
 *   3. the browser's own language;
 *   4. English.
 * Cached per request, so every component on a page asks once.
 */
export const getLocale = cache(async (): Promise<Locale> => {
  const fromCookie = cookies().get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;

  const me = await sessionUser();
  if (me?.id) {
    const row = (await db.select({ locale: users.locale }).from(users).where(eq(users.id, me.id)).limit(1).catch(() => []))[0];
    if (row && isLocale(row.locale)) return row.locale;
  }

  return fromAcceptLanguage(headers().get('accept-language')) ?? DEFAULT_LOCALE;
});

/** A t() for one area's words, in this request's language. */
export async function getT<M extends Messages>(book: MessageBook<M>) {
  return translator(book, await getLocale());
}

/** A person's saved language, for texts and emails sent to them. */
export async function localeForUser(userId: string | null | undefined): Promise<Locale> {
  if (!userId) return DEFAULT_LOCALE;
  const row = (await db.select({ locale: users.locale }).from(users).where(eq(users.id, userId)).limit(1))[0];
  return isLocale(row?.locale) ? row.locale : DEFAULT_LOCALE;
}
