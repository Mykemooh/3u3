import { sendEmail } from '@/lib/email';
import { sendSmsDetailed, smsConfigured, sendWhatsApp, whatsAppConfigured } from '@/lib/sms';
import { tenantSmsNumber, recordOutbound } from '@/lib/messaging';
import { logNotification } from '@/lib/bookings';
import { withUsage } from '@/lib/billing/wallet';
import { smsSegments } from '@/lib/billing/plans';
import { companyForTenant, fillCompanyText } from '@/lib/emailBrand';

export type NotificationChannel = 'EMAIL' | 'SMS' | 'WHATSAPP';

/**
 * Sends to a client on whichever channel they picked in My Account
 * (users.notificationChannel), falling back to email when their chosen
 * channel isn't actually available (no phone on file, or Twilio/WhatsApp
 * isn't configured) — reminders should still go out, just by whatever
 * means works. Used by lib/reminders.ts for both booking and quote
 * follow-up reminders.
 */
export async function notifyClient(input: {
  tenantId: string;
  client: { id?: string; email: string | null; phone: string | null; notificationChannel: NotificationChannel; smsConsent?: boolean | null };
  triggerEvent: string;
  relatedBookingId?: string;
  email: { subject: string; html: string } | null;
  text: string;
}): Promise<boolean> {
  const { client } = input;
  // Texts carry the company's own name (lib/emailBrand.ts); emails are filled in by sendEmail.
  input = { ...input, text: fillCompanyText(input.text, await companyForTenant(input.tenantId)) };

  // A client who replied STOP gets email instead (lib/messaging.ts).
  const textable = client.smsConsent !== false;

  // A company without its own texting number sends by email instead.
  const from = client.notificationChannel === 'SMS' && client.phone && smsConfigured() && textable ? await tenantSmsNumber(input.tenantId) : null;
  // Paid from the company's credits first (lib/billing/wallet.ts); with no
  // credits left the message still goes out — by email.
  const usage = from && client.phone ? await withUsage(input.tenantId, 'SMS', smsSegments(input.text), () => sendSmsDetailed({ to: client.phone!, body: input.text, from }), (r) => r.ok) : null;
  if (from && client.phone && usage?.charged) {
    const sent = usage.result;
    await logNotification({ tenantId: input.tenantId, channel: 'SMS', recipient: client.phone, triggerEvent: input.triggerEvent, relatedBookingId: input.relatedBookingId });
    // Filed in the client's text thread, so the inbox shows what they were sent.
    if (sent.ok) {
      await recordOutbound({ tenantId: input.tenantId, clientId: client.id ?? null, from: sent.from ?? from, to: sent.to ?? client.phone, body: input.text, sid: sent.sid }).catch(() => undefined);
    }
    return sent.ok;
  }

  if (client.notificationChannel === 'WHATSAPP' && client.phone && whatsAppConfigured() && textable) {
    const ok = await sendWhatsApp({ to: client.phone, body: input.text });
    await logNotification({ tenantId: input.tenantId, channel: 'WHATSAPP', recipient: client.phone, triggerEvent: input.triggerEvent, relatedBookingId: input.relatedBookingId });
    return ok;
  }

  if (input.email && client.email) {
    const ok = await sendEmail({ to: client.email, subject: input.email.subject, html: input.email.html, tenantId: input.tenantId });
    await logNotification({ tenantId: input.tenantId, channel: 'EMAIL', recipient: client.email, triggerEvent: input.triggerEvent, relatedBookingId: input.relatedBookingId });
    return ok;
  }

  return false;
}
