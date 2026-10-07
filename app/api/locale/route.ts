import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { sessionUser } from '@/lib/sessionUser';
import { LOCALE_COOKIE, isLocale } from '@/lib/i18n';

/**
 * The language toggle (components/i18n/LanguageToggle.tsx). Sets the cookie
 * for this browser and, for a signed-in person, saves the choice on their
 * account so other devices, texts and emails follow it too.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { locale?: unknown };
  if (!isLocale(body.locale)) return NextResponse.json({ error: 'Pick English or Spanish.' }, { status: 400 });

  const me = await sessionUser();
  if (me?.id) await db.update(users).set({ locale: body.locale }).where(eq(users.id, me.id));

  const res = NextResponse.json({ ok: true, locale: body.locale, saved: !!me?.id });
  res.cookies.set(LOCALE_COOKIE, body.locale, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
  return res;
}
