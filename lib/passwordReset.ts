import { db } from '@/db/client';
import { users } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { issuePasswordSetupToken } from '@/lib/passwordSetup';
import { logNotification } from '@/lib/bookings';
import { sendEmail, passwordResetEmail } from '@/lib/email';
import { sendSms, smsConfigured } from '@/lib/sms';
import { appUrl } from '@/lib/url';

/**
 * "Forgot your username or password?" One form covers both: the person
 * types whatever they remember — email or phone — and the message that
 * comes back says which details they sign in with and carries a one-hour
 * link to choose a new password. The link lands on /set-password, reusing
 * the same single-use token as the new-client "create your password" flow.
 *
 * The caller always gets the same answer whether or not an account
 * matched, so the form can't be used to find out who's a client.
 */

const RESET_TTL_MS = 60 * 60 * 1000;
/** One message per account per minute, however often the form is sent. */
const RESEND_GAP_MS = 60 * 1000;

type User = typeof users.$inferSelect;

/**
 * Phones are stored as typed, so "281-555-0199" and "+1 (281) 555-0199"
 * must find the same person: compare the last ten digits only.
 */
async function findUser(input: string): Promise<User | null> {
  const value = input.trim();
  if (value.includes('@')) {
    return (await db.select().from(users).where(sql`lower(${users.email}) = ${value.toLowerCase()}`).limit(1))[0] ?? null;
  }
  const digits = value.replace(/\D/g, '');
  if (digits.length < 10) return null;
  const last10 = digits.slice(-10);
  return (
    (
      await db
        .select()
        .from(users)
        .where(sql`right(regexp_replace(${users.phone}, '[^0-9]', '', 'g'), 10) = ${last10}`)
        .limit(1)
    )[0] ?? null
  );
}

export async function requestPasswordReset(input: string): Promise<void> {
  const user = await findUser(input);
  if (!user) return;
  if (user.passwordResetSentAt && Date.now() - user.passwordResetSentAt.getTime() < RESEND_GAP_MS) return;

  // They asked by phone: text them if texting is set up, else fall back to
  // the email on file. They asked by email: email.
  const byPhone = !input.includes('@');
  const channel: 'SMS' | 'EMAIL' | null =
    byPhone && user.phone && smsConfigured() ? 'SMS' : user.email ? 'EMAIL' : null;
  if (!channel) {
    console.warn(`[password-reset] ${user.id} has no way to receive a reset link (no email, and texting isn't set up).`);
    return;
  }

  const token = await issuePasswordSetupToken(user.id, RESET_TTL_MS);
  await db.update(users).set({ passwordResetSentAt: new Date() }).where(eq(users.id, user.id));
  const url = appUrl(`/set-password?token=${token}&reset=1`);
  // Anything on the account works as the "username" at sign-in.
  const signInWith = [user.phone, user.email].filter((v): v is string => !!v);

  if (channel === 'SMS') {
    const ok = await sendSms({
      to: user.phone!,
      body: `3U3 Cleaning: you sign in with ${signInWith.join(' or ')}. Reset your password (link works for 1 hour): ${url}`,
    });
    await log(user, 'SMS', user.phone!, ok);
    if (ok || !user.email) return;
    // The text didn't go through — try email rather than leave them stuck.
  }
  const { subject, html } = passwordResetEmail({ name: user.name, url, signInWith });
  await log(user, 'EMAIL', user.email!, await sendEmail({ to: user.email!, subject, html }));
}

function log(user: User, channel: 'SMS' | 'EMAIL', recipient: string, ok: boolean) {
  return logNotification({
    tenantId: user.tenantId,
    channel,
    recipient,
    triggerEvent: ok ? 'PASSWORD_RESET' : 'PASSWORD_RESET_NOT_DELIVERED',
  });
}
