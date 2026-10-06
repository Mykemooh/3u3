import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { tenants, users } from '@/db/schema';
import { sendEmail, simpleEmail } from '@/lib/email';
import { logNotification } from '@/lib/bookings';
import { appUrl } from '@/lib/url';

/**
 * Billing messages to a company's owners: an email to every admin, plus an
 * entry in the workspace's Alerts ("CODE: message", AdminAlertsPanel).
 */
export async function notifyCompanyAdmins(tenantId: string, code: string, subject: string, body: string, cta?: { label: string; path: string }) {
  const admins = await db.select({ email: users.email }).from(users).where(and(eq(users.tenantId, tenantId), eq(users.role, 'ADMIN'), eq(users.isActive, true)));
  const html = simpleEmail({ brandName: 'TRASHCAN', heading: subject, body, cta: cta ? { label: cta.label, url: appUrl(cta.path) } : undefined });
  for (const a of admins) {
    if (!a.email) continue;
    await sendEmail({ to: a.email, subject, html }).catch(() => false);
  }
  await logNotification({ tenantId, channel: 'EMAIL', recipient: 'admins', triggerEvent: `${code}: ${subject}` }).catch(() => undefined);
}

export async function notifyLowBalance(tenantId: string, kind: 'LOW' | 'EMPTY') {
  if (kind === 'EMPTY') {
    await notifyCompanyAdmins(
      tenantId,
      'CREDITS_EMPTY',
      'Texting is paused — you’re out of credits',
      'Your TRASHCAN credits ran out, so texts and Tex phone calls are paused. Email, the app and Tex web chat keep working.\n\nAdd credits and texting starts again right away. Turn on auto top-up so it never pauses.',
      { label: 'Add credits', path: '/admin/plan' },
    );
  } else {
    await notifyCompanyAdmins(
      tenantId,
      'CREDITS_LOW',
      'Your texting credits are running low',
      'You have less than $5 of credits left. When they run out, texts and Tex phone calls pause until you add more.',
      { label: 'Add credits', path: '/admin/plan' },
    );
  }
}

export async function notifyPlatformOwners(subject: string, body: string, path = '/platform/companies') {
  const owners = await db.select({ email: users.email }).from(users).where(eq(users.role, 'SUPER_ADMIN'));
  for (const o of owners) {
    if (!o.email) continue;
    await sendEmail({ to: o.email, subject, html: simpleEmail({ brandName: 'TRASHCAN', heading: subject, body, cta: { label: 'Open the platform', url: appUrl(path) } }) }).catch(() => false);
  }
}

export async function companyName(tenantId: string) {
  return (await db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, tenantId)).limit(1))[0]?.name ?? 'A company';
}
