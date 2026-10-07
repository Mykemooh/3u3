import { sql, type SQL } from 'drizzle-orm';
import { users } from '@/db/schema';
import { toE164 } from '@/lib/sms';

/**
 * One way to store a phone number: E.164 ("+17135550601") whenever it's a
 * North American number, however it was typed ("(713) 555-0601",
 * "+1 7135550601", "713.555.0601"). Anything else is kept as typed.
 */
export function normalizePhone(input: string): string {
  return toE164(input) ?? input.trim();
}

/** The last ten digits, for matching a typed number against stored ones. */
export function phoneKey(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : null;
}

/**
 * A where-clause matching users.phone to a typed number by its digits, so
 * rows saved before numbers were normalised still match. Null when the
 * input isn't a full phone number.
 */
export function samePhone(input: string): SQL | null {
  const key = phoneKey(input);
  return key ? sql`right(regexp_replace(${users.phone}, '\\D', '', 'g'), 10) = ${key}` : null;
}
