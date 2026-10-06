import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { texActions, users } from '@/db/schema';
import type { TexContext } from '@/lib/texTools';

/**
 * A client's 4-digit phone PIN. Said on a call (or texted, or keyed in),
 * it lets Tex confirm who is calling without a texted code. It's a
 * convenience for the phone only — it never signs anyone in.
 *
 * Stored as a salted scrypt hash. Five wrong tries lock it for 30 minutes
 * (the texted-code route still works), the count is kept on the account
 * so it holds across calls, and the PIN is never written into Tex's
 * conversation log (see redactPin).
 */

const MAX_FAILURES = 5;
const LOCK_MINUTES = 30;
const DIGIT_WORDS: Record<string, string> = { zero: '0', oh: '0', o: '0', one: '1', two: '2', to: '2', too: '2', three: '3', four: '4', for: '4', five: '5', six: '6', seven: '7', eight: '8', ate: '8', nine: '9' };

const hash = (pin: string, salt: string) => scryptSync(pin, salt, 32).toString('hex');

export class PinError extends Error {}

/** "1234", "1 2 3 4", "one two three four", "my pin is 1-2-3-4" → "1234" (or null). */
export function parsePin(spoken: string): string | null {
  const words = spoken.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ');
  let digits = '';
  for (const w of words) {
    if (/^\d+$/.test(w)) digits += w;
    else if (w in DIGIT_WORDS) digits += DIGIT_WORDS[w];
  }
  return /^\d{4}$/.test(digits) ? digits : null;
}

/** Keeps a PIN out of saved conversations: four digits (or four spoken digits in a row) become ••••. */
export function redactPin(text: string) {
  const w = '(?:zero|oh|one|two|three|four|five|six|seven|eight|nine)';
  return text
    .replace(new RegExp(`\\b${w}(?:[\\s,.-]+${w}){3}\\b`, 'gi'), '••••')
    .replace(/\b\d(?:[\s,.-]?\d){3}\b/g, '••••');
}

const WEAK = new Set(['0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999', '1234', '4321', '2345', '3456', '0123', '1212', '2580']);

export async function setPin(userId: string, pin: string) {
  if (!/^\d{4}$/.test(pin)) throw new PinError('A PIN is exactly 4 digits.');
  if (WEAK.has(pin)) throw new PinError('That one is too easy to guess. Pick another 4 digits.');
  const salt = randomBytes(16).toString('hex');
  await db.update(users).set({ phonePinHash: `${salt}:${hash(pin, salt)}`, phonePinFailures: 0, phonePinLockedUntil: null }).where(eq(users.id, userId));
}

export async function clearPin(userId: string) {
  await db.update(users).set({ phonePinHash: null, phonePinFailures: 0, phonePinLockedUntil: null }).where(eq(users.id, userId));
}

export async function hasPin(userId: string) {
  const u = (await db.select({ h: users.phonePinHash }).from(users).where(eq(users.id, userId)).limit(1))[0];
  return !!u?.h;
}

/** Is the PIN check available right now (set, and not locked)? */
export async function pinUsable(userId: string) {
  const u = (await db.select({ h: users.phonePinHash, lock: users.phonePinLockedUntil }).from(users).where(eq(users.id, userId)).limit(1))[0];
  return !!u?.h && !(u.lock && u.lock.getTime() > Date.now());
}

/**
 * Checks what the caller said. On success the conversation is marked
 * verified (a finished VERIFY action, via 'pin'), exactly as a texted code
 * would. Returns a short result for Tex to act on.
 */
export async function checkPin(ctx: TexContext, spoken: string) {
  if (!ctx.userId) return { ok: false, error: 'I can’t tell which account this is yet.' };
  const u = (await db.select().from(users).where(and(eq(users.id, ctx.userId), eq(users.tenantId, ctx.tenant.id))).limit(1))[0];
  if (!u?.phonePinHash) return { ok: false, error: 'There’s no PIN set on this account. Offer to text a code to the number on file instead.' };
  if (u.phonePinLockedUntil && u.phonePinLockedUntil.getTime() > Date.now()) {
    return { ok: false, locked: true, error: 'PIN checks are paused on this account for a little while. Offer to text a code to the number on file instead.' };
  }
  const pin = parsePin(spoken);
  if (!pin) return { ok: false, error: 'That wasn’t four digits. Ask them to say the four digits again, slowly.' };

  // Count the try first, so parallel guesses can't all slip through.
  const [salt, want] = u.phonePinHash.split(':');
  const good = (() => {
    const a = Buffer.from(want, 'hex');
    const b = Buffer.from(hash(pin, salt), 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  })();
  if (!good) {
    const failures = u.phonePinFailures + 1;
    await db.update(users).set({ phonePinFailures: failures, phonePinLockedUntil: failures >= MAX_FAILURES ? new Date(Date.now() + LOCK_MINUTES * 60_000) : u.phonePinLockedUntil }).where(eq(users.id, u.id));
    if (failures >= MAX_FAILURES) return { ok: false, locked: true, error: 'Too many wrong PINs, so PIN checks are paused on this account. Offer to text a code to the number on file instead.' };
    return { ok: false, error: 'That PIN doesn’t match. They can try once more, or you can text a code to the number on file.' };
  }
  await db.update(users).set({ phonePinFailures: 0, phonePinLockedUntil: null }).where(eq(users.id, u.id));
  await db.insert(texActions).values({
    id: crypto.randomUUID(),
    tenantId: ctx.tenant.id,
    conversationId: ctx.conversationId,
    userId: u.id,
    kind: 'VERIFY',
    summary: 'Verified with PIN',
    payloadJson: JSON.stringify({ via: 'pin' }),
    status: 'DONE',
    doneAt: new Date(),
    expiresAt: new Date(Date.now() + 30 * 60_000),
  });
  return { ok: true, note: 'PIN matches. You can now look at and change this client’s account for the rest of the call. Do not repeat the PIN back.' };
}

/** Did this conversation verify with the PIN in the last 30 minutes? (Used to skip the texted code for changes.) */
export async function pinVerified(ctx: Pick<TexContext, 'tenant' | 'conversationId' | 'userId'>) {
  if (!ctx.userId) return false;
  const rows = await db
    .select({ p: texActions.payloadJson, at: texActions.doneAt })
    .from(texActions)
    .where(and(eq(texActions.tenantId, ctx.tenant.id), eq(texActions.conversationId, ctx.conversationId), eq(texActions.userId, ctx.userId), eq(texActions.kind, 'VERIFY'), eq(texActions.status, 'DONE')));
  return rows.some((r) => r.at && Date.now() - r.at.getTime() < 30 * 60_000 && r.p?.includes('"via":"pin"'));
}
