import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';
import { appUrl } from '@/lib/url';

/**
 * Signed one-click unsubscribe links for marketing email (campaigns and
 * win-back). The token is an HMAC of the user id, so a link can't be
 * forged for someone else and needs no database row.
 */
function key() {
  const base = process.env.NEXTAUTH_SECRET || 'dev-secret';
  return Buffer.from(hkdfSync('sha256', base, 'trashcan-unsubscribe', 'marketing', 32));
}

export function unsubscribeToken(userId: string) {
  return createHmac('sha256', key()).update(userId).digest('base64url').slice(0, 32);
}

export function verifyUnsubscribe(userId: string, token: string) {
  const want = Buffer.from(unsubscribeToken(userId));
  const got = Buffer.from(token);
  return want.length === got.length && timingSafeEqual(want, got);
}

export function unsubscribeUrl(userId: string) {
  return appUrl(`/unsubscribe?u=${encodeURIComponent(userId)}&t=${unsubscribeToken(userId)}`);
}
