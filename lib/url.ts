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
