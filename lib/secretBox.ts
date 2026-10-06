import { createHash, randomBytes } from 'node:crypto';
import { encryptField, decryptField, encryptionConfigured } from '@/lib/encryption';

/**
 * Secrets this app has to read back later (webhook signing secrets,
 * outside services' refresh tokens). Encrypted at rest with
 * HOME_PROFILE_ENCRYPTION_KEY when it's set; stored as-is otherwise, the
 * same as the QuickBooks tokens before this existed. A stored value that
 * isn't marked as encrypted is read back unchanged, so turning the key on
 * later never breaks an existing connection.
 */

const MARK = 'enc:v1:';

export function seal(value: string): string {
  return encryptionConfigured() ? MARK + encryptField(value) : value;
}

export function unseal(stored: string | null | undefined): string | null {
  if (stored == null) return null;
  if (!stored.startsWith(MARK)) return stored;
  return decryptField(stored.slice(MARK.length));
}

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/** URL-safe random token with a readable prefix, e.g. "tc_live_…". */
export function randomToken(prefix: string, bytes = 24): string {
  return `${prefix}${randomBytes(bytes).toString('base64url')}`;
}
