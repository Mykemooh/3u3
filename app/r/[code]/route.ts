import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { tenants, users } from '@/db/schema';
import { COMPANY_COOKIE } from '@/lib/data';

/**
 * A client's referral link. Remembers the code for 60 days and sends the
 * visitor to the walkthrough request; app/api/leads reads the cookie when
 * the new client is created (lib/referrals.ts recordReferral). It also
 * remembers the referring client's company, so a friend on a shared
 * address books with that company (app/c, lib/data.ts getTenant).
 */
export async function GET(req: Request, { params }: { params: { code: string } }) {
  const code = params.code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  const res = NextResponse.redirect(new URL('/new', req.url));
  if (code) {
    res.cookies.set('ref', code, { maxAge: 60 * 60 * 24 * 60, httpOnly: true, sameSite: 'lax', path: '/' });
    const row = (
      await db.select({ slug: tenants.slug }).from(users).innerJoin(tenants, eq(tenants.id, users.tenantId)).where(eq(users.referralCode, code)).limit(1)
    )[0];
    if (row) res.cookies.set(COMPANY_COOKIE, row.slug, { maxAge: 60 * 60 * 24 * 30, httpOnly: true, sameSite: 'lax', path: '/' });
  }
  return res;
}
