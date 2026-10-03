import crypto from 'node:crypto';

/**
 * AES-256-GCM, for the one genuinely sensitive field in this app: a
 * home's alarm/entry code (addresses.entryCodeEncrypted). Everything
 * else "the cleaner needs to know" is plain text — this is the one
 * piece that's actually a security credential to someone's home, so it
 * gets real encryption at rest, not just access control.
 *
 * HOME_PROFILE_ENCRYPTION_KEY is a 32-byte key, base64-encoded. Without
 * it, encryptField() refuses to store anything (no silent plaintext
 * fallback) and decryptField() returns null (the UI then says the key
 * isn't configured, rather than looking like no code was ever set).
 */

function getKey(): Buffer | null {
  const raw = process.env.HOME_PROFILE_ENCRYPTION_KEY;
  if (!raw) return null;
  try {
    const key = Buffer.from(raw, 'base64');
    return key.length === 32 ? key : null;
  } catch {
    return null;
  }
}

export function encryptionConfigured(): boolean {
  return !!getKey();
}

/** Encrypts one string. Throws if HOME_PROFILE_ENCRYPTION_KEY isn't set or isn't a valid 32-byte key — callers should check encryptionConfigured() first and surface a clear error instead of losing the value silently. */
export function encryptField(plaintext: string): string {
  const key = getKey();
  if (!key) throw new Error('HOME_PROFILE_ENCRYPTION_KEY is not set — cannot store this securely.');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // iv (12) + authTag (16) + ciphertext, all base64 together.
  return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
}

/** Decrypts a value from encryptField(). Returns null if the key is missing/wrong or the value is malformed — never throws, so a page rendering several fields doesn't break on one bad value. */
export function decryptField(stored: string | null | undefined): string | null {
  if (!stored) return null;
  const key = getKey();
  if (!key) return null;
  try {
    const raw = Buffer.from(stored, 'base64');
    const iv = raw.subarray(0, 12);
    const authTag = raw.subarray(12, 28);
    const ciphertext = raw.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch (err) {
    console.error('[encryption] decrypt failed:', err);
    return null;
  }
}
