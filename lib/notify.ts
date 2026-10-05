import { sendEmail } from '@/lib/email';
import { sendSmsDetailed, smsConfigured, sendWhatsApp, whatsAppConfigured } from '@/lib/sms';
import { tenantSmsNumber, recordOutbound } from '@/lib/messaging';
import { logNotification } from '@/lib/bookings';

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

  // A client who replied STOP gets email instead (lib/messaging.ts).
  const textable = client.smsConsent !== false;

  if (client.notificationChannel === 'SMS' && client.phone && smsConfigured() && textable) {
    const from = await tenantSmsNumber(input.tenantId);
    const sent = await sendSmsDetailed({ to: client.phone, body: input.text, from });
    await logNotification({ tenantId: input.tenantId, channel: 'SMS', recipient: client.phone, triggerEvent: input.triggerEvent, relatedBookingId: input.relatedBookingId });
    // Filed in the client's text thread, so the inbox shows what they were sent.
    if (sent.ok) {
      await recordOutbound({ tenantId: input.tenantId, clientId: client.id ?? null, from: sent.from ?? from ?? '', to: sent.to ?? client.phone, body: input.text, sid: sent.sid }).catch(() => undefined);
    }
    return sent.ok;
  }

  if (client.notificationChannel === 'WHATSAPP' && client.phone && whatsAppConfigured() && textable) {
    const ok = await sendWhatsApp({ to: client.phone, body: input.text });
    await logNotification({ tenantId: input.tenantId, channel: 'WHATSAPP', recipient: client.phone, triggerEvent: input.triggerEvent, relatedBookingId: input.relatedBookingId });
    return ok;
  }

  if (input.email && client.email) {
    const ok = await sendEmail({ to: client.email, subject: input.email.subject, html: input.email.html });
    await logNotification({ tenantId: input.tenantId, channel: 'EMAIL', recipient: client.email, triggerEvent: input.triggerEvent, relatedBookingId: input.relatedBookingId });
    return ok;
  }

  return false;
}
