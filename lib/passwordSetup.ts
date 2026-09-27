import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';

const TOKEN_TTL_DAYS = 14;

/**
 * Every new client (lead capture or admin-added) gets one of these so they
 * can set their own password without the office having to hand one out.
 * Stored on the user row directly since it's a one-at-a-time, per-account
 * thing, not a log of past invites.
 */
export async function issuePasswordSetupToken(userId: string) {
  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  await db
    .update(users)
    .set({ passwordSetupToken: token, passwordSetupExpiresAt: expiresAt })
    .where(eq(users.id, userId));
  return token;
}

/**
 * Sets the password and immediately clears the token — so the same link
 * can't be replayed, and there's no separate approval step standing
 * between "password set" and "can sign in": the very next authorize()
 * call sees the new passwordHash.
 */
export async function setPasswordFromToken(token: string, password: string) {
  const user = (await db.select().from(users).where(eq(users.passwordSetupToken, token)).limit(1))[0];
  if (!user) {
    return { ok: false as const, error: 'This link is invalid. Ask us to send you a new one.' };
  }
  if (!user.passwordSetupExpiresAt || user.passwordSetupExpiresAt.getTime() < Date.now()) {
    return { ok: false as const, error: 'This link has expired. Ask us to send you a new one.' };
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  await db
    .update(users)
    .set({ passwordHash, passwordSetupToken: null, passwordSetupExpiresAt: null })
    .where(eq(users.id, user.id));

  return { ok: true as const, identifier: user.phone ?? user.email ?? '', name: user.name };
}
