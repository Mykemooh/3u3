import { isHouseBrand } from '@/lib/brand';

/**
 * Absolute links for emails and texts. Built from NEXTAUTH_URL, which is
 * already required for sign-in to work, so there's no extra setting.
 */
export function appUrl(path = '/') {
  let base = (process.env.NEXTAUTH_URL || 'http://localhost:3000').trim().replace(/\/+$/, '');
  // NEXTAUTH_URL is routinely set to a bare hostname; a link without a
  // scheme isn't clickable in most mail clients.
  if (!/^https?:\/\//i.test(base)) {
    base = `${base.startsWith('localhost') ? 'http' : 'https'}://${base}`;
  }
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * A company's public "book a free walkthrough" link: its own domain or
 * subdomain when it has one, otherwise /c/<slug> on the shared address,
 * which remembers the company before opening the booking form (app/c). The
 * first company on a deployment (the house account the bare address falls
 * back to) keeps the plain /new.
 */
export function bookingLinkFor(tenant: { slug: string; name: string; logoUrl?: string | null; customDomain?: string | null }, query = '') {
  if (tenant.customDomain) return `https://${tenant.customDomain}/new${query}`;
  const base = process.env.TENANT_BASE_DOMAIN?.toLowerCase().replace(/^\./, '');
  if (base) return `https://${tenant.slug}.${base}/new${query}`;
  return isHouseBrand(tenant) ? appUrl(`/new${query}`) : appUrl(`/c/${tenant.slug}${query}`);
}
