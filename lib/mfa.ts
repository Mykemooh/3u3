import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import QRCode from 'qrcode';
import { db } from '@/db/client';
import { users, tenants } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { generateSecret, otpauthUrl, verifyTotp } from '@/lib/totp';
import { sendEmail, simpleEmail } from '@/lib/email';
import { translator } from '@/lib/i18n';
import { notifyMessages } from '@/lib/i18n/messages/notify';

/**
 * Multi-factor sign-in for every portal.
 *
 *  - Admins must have it. Crew must have it when the company turns that on
 *    (tenants.mfaRequiredForCrew). Everyone else is asked once at sign-in
 *    and can say "remind me later" (30 days).
 *  - Three ways to answer: an authenticator app (free, works offline), a
 *    code emailed to them, or one of ten single-use backup codes.
 *  - "Remember this device" skips the question for 30 days on that browser
 *    (a signed cookie, checked in lib/auth.ts).
 *
 * The authenticator secret is encrypted at rest with a key derived from
 * NEXTAUTH_SECRET (always set in production), so this works without any
 * new environment variable. Backup and email codes are only ever stored
 * as hashes.
 */

export class MfaError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const ISSUER = process.env.MFA_ISSUER || 'TrashCan';
export const TRUST_COOKIE = 'mfa_trusted';
export const TRUST_DAYS = 30;
const EMAIL_CODE_MINUTES = 10;

function secretKey(): Buffer {
  const base = process.env.NEXTAUTH_SECRET;
  if (!base) throw new MfaError('Sign-in security is not configured (NEXTAUTH_SECRET).', 500);
  return Buffer.from(hkdfSync('sha256', base, 'trashcan-mfa', 'totp-secret', 32));
}

function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', secretKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
}

function decrypt(value: string): string {
  const [iv, tag, enc] = value.split('.').map((p) => Buffer.from(p, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', secretKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

const hash = (code: string) => createHash('sha256').update(code.replace(/[\s-]/g, '').toUpperCase()).digest('hex');

async function loadUser(userId: string) {
  const user = (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0];
  if (!user) throw new MfaError('Account not found.', 404);
  return user;
}

/** Whether this person must have MFA before they can use their portal. */
export async function mfaRequired(user: { role: string; tenantId: string }): Promise<boolean> {
  if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') return true;
  if (user.role === 'CLEANER') {
    const tenant = (await db.select().from(tenants).where(eq(tenants.id, user.tenantId)).limit(1))[0];
    return !!tenant?.mfaRequiredForCrew;
  }
  return false;
}

export type MfaState = {
  enabled: boolean;
  required: boolean;
  /** Not enabled, not required, and not snoozed — ask them once. */
  shouldPrompt: boolean;
  hasEmail: boolean;
};

export async function mfaState(userId: string): Promise<MfaState> {
  const user = await loadUser(userId);
  const required = await mfaRequired(user);
  const enabled = !!user.mfaEnabledAt;
  const snoozed = user.mfaPromptSnoozedUntil && user.mfaPromptSnoozedUntil.getTime() > Date.now();
  return { enabled, required, shouldPrompt: !enabled && !required && !snoozed, hasEmail: !!user.email };
}

/** Step 1 of setup: a fresh secret (not active until confirmed) and its QR code. */
export async function beginSetup(userId: string): Promise<{ secret: string; qrDataUrl: string; otpauth: string }> {
  const user = await loadUser(userId);
  const secret = generateSecret();
  await db.update(users).set({ mfaSecretEncrypted: encrypt(secret) }).where(eq(users.id, userId));
  const account = user.email ?? user.phone ?? user.name;
  // Shown in the authenticator next to the code: the company's own name,
  // so 3U3's crew see "3U3 Cleaning", not the platform's.
  const tenant = (await db.select().from(tenants).where(eq(tenants.id, user.tenantId)).limit(1))[0];
  const issuer = process.env.MFA_ISSUER || (tenant && !tenant.isPlatform ? tenant.name : ISSUER);
  const otpauth = otpauthUrl({ secret, account, issuer });
  const qrDataUrl = await QRCode.toDataURL(otpauth, { margin: 1, width: 220 });
  return { secret, qrDataUrl, otpauth };
}

/** Step 2: the code from their app proves it's set up. Returns ten backup codes, shown once. */
export async function confirmSetup(userId: string, code: string): Promise<{ backupCodes: string[] }> {
  const user = await loadUser(userId);
  if (!user.mfaSecretEncrypted) throw new MfaError('Start setup again — no authenticator was linked yet.');
  if (!verifyTotp(decrypt(user.mfaSecretEncrypted), code)) {
    throw new MfaError("That code didn't match. Check the time on your phone is set automatically and try the newest code.");
  }
  const backupCodes = Array.from({ length: 10 }, () => {
    const raw = randomBytes(5).toString('hex').toUpperCase();
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
  await db
    .update(users)
    .set({ mfaEnabledAt: new Date(), mfaBackupCodes: backupCodes.map(hash).join(','), mfaPromptSnoozedUntil: null })
    .where(eq(users.id, userId));
  return { backupCodes };
}

/** Emails a 6-digit code, good for 10 minutes. */
export async function sendEmailCode(userId: string): Promise<{ sentTo: string }> {
  const user = await loadUser(userId);
  if (!user.email) throw new MfaError('There is no email on this account — use your authenticator app or a backup code.');
  if (user.mfaEmailCodeExpiresAt && user.mfaEmailCodeExpiresAt.getTime() - Date.now() > (EMAIL_CODE_MINUTES - 1) * 60000) {
    throw new MfaError('A code was just sent — give it a minute to arrive before asking for another.', 429);
  }
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await db
    .update(users)
    .set({ mfaEmailCodeHash: hash(code), mfaEmailCodeExpiresAt: new Date(Date.now() + EMAIL_CODE_MINUTES * 60000) })
    .where(eq(users.id, userId));
  const t = translator(notifyMessages, user.locale === 'es' ? 'es' : 'en');
  await sendEmail({
    to: user.email,
    subject: t('mfaSubject', { code }),
    html: simpleEmail({
      brandName: ISSUER,
      heading: t('mfaHeading'),
      body: t('mfaBody', { code, minutes: EMAIL_CODE_MINUTES }),
    }),
  });
  const [name, domain] = user.email.split('@');
  return { sentTo: `${name.slice(0, 2)}•••@${domain}` };
}

/**
 * Checks a code from any of the three methods. A backup code or email code
 * works once; an authenticator code works within its 30-second window.
 */
export async function verifyMfaCode(userId: string, code: string): Promise<'totp' | 'email' | 'backup' | null> {
  const user = await loadUser(userId);
  const clean = code.trim();
  if (user.mfaEnabledAt && user.mfaSecretEncrypted && /^\d{6}$/.test(clean.replace(/\s/g, ''))) {
    if (verifyTotp(decrypt(user.mfaSecretEncrypted), clean)) return 'totp';
  }
  if (user.mfaEmailCodeHash && user.mfaEmailCodeExpiresAt && user.mfaEmailCodeExpiresAt.getTime() > Date.now()) {
    if (safeEqual(hash(clean), user.mfaEmailCodeHash)) {
      await db.update(users).set({ mfaEmailCodeHash: null, mfaEmailCodeExpiresAt: null }).where(eq(users.id, userId));
      return 'email';
    }
  }
  const backups = (user.mfaBackupCodes ?? '').split(',').filter(Boolean);
  const idx = backups.findIndex((b) => safeEqual(b, hash(clean)));
  if (idx >= 0) {
    backups.splice(idx, 1);
    await db.update(users).set({ mfaBackupCodes: backups.join(',') }).where(eq(users.id, userId));
    return 'backup';
  }
  return null;
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export async function snoozePrompt(userId: string, days = 30) {
  await db.update(users).set({ mfaPromptSnoozedUntil: new Date(Date.now() + days * 86400000) }).where(eq(users.id, userId));
}

export async function disableMfa(userId: string, code: string) {
  const user = await loadUser(userId);
  if (await mfaRequired(user)) throw new MfaError('Your role requires two-step sign-in, so it can’t be turned off.', 403);
  if (!(await verifyMfaCode(userId, code))) throw new MfaError("That code didn't match.");
  await db
    .update(users)
    .set({ mfaEnabledAt: null, mfaSecretEncrypted: null, mfaBackupCodes: null })
    .where(eq(users.id, userId));
}

export async function backupCodesLeft(userId: string): Promise<number> {
  const user = await loadUser(userId);
  return (user.mfaBackupCodes ?? '').split(',').filter(Boolean).length;
}

// ---- Remember this device ------------------------------------------------

function trustSignature(userId: string, expires: number) {
  return createHmac('sha256', secretKey()).update(`${userId}.${expires}`).digest('base64url');
}

export function makeTrustCookie(userId: string): { value: string; maxAge: number } {
  const expires = Date.now() + TRUST_DAYS * 86400000;
  return { value: `${userId}.${expires}.${trustSignature(userId, expires)}`, maxAge: TRUST_DAYS * 86400 };
}

export function isTrustedDevice(cookieValue: string | undefined, userId: string): boolean {
  if (!cookieValue) return false;
  const [uid, expiresRaw, sig] = cookieValue.split('.');
  const expires = Number(expiresRaw);
  if (uid !== userId || !Number.isFinite(expires) || expires < Date.now() || !sig) return false;
  try {
    return safeEqual(sig, trustSignature(uid, expires));
  } catch {
    return false;
  }
}
