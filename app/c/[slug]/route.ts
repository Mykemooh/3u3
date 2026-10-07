import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { tenants } from '@/db/schema';
import { COMPANY_COOKIE } from '@/lib/data';

/**
 * A company's own booking link when it has no subdomain or custom domain
 * yet (Admin → Settings → Booking link). Remembers which company the
 * visitor came for, so the walkthrough request, its services and its
 * times are that company's — not whichever company the bare address
 * falls back to — then opens the booking form.
 */
export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const slug = params.slug.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 80);
  const url = new URL(req.url);
  const target = new URL('/new', req.url);
  const service = url.searchParams.get('service');
  if (service) target.searchParams.set('service', service);
  const res = NextResponse.redirect(target);
  const tenant = slug
    ? (await db.select({ id: tenants.id }).from(tenants).where(and(eq(tenants.slug, slug), eq(tenants.isPlatform, false))).limit(1))[0]
    : undefined;
  if (tenant) res.cookies.set(COMPANY_COOKIE, slug, { maxAge: 60 * 60 * 24 * 30, httpOnly: true, sameSite: 'lax', path: '/' });
  return res;
}
