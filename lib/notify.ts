import { sendEmail } from '@/lib/email';
import { sendSms, smsConfigured, sendWhatsApp, whatsAppConfigured } from '@/lib/sms';
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
  client: { email: string | null; phone: string | null; notificationChannel: NotificationChannel };
  triggerEvent: string;
  relatedBookingId?: string;
  email: { subject: string; html: string } | null;
  text: string;
}): Promise<boolean> {
  const { client } = input;

  if (client.notificationChannel === 'SMS' && client.phone && smsConfigured()) {
    const ok = await sendSms({ to: client.phone, body: input.text });
    await logNotification({ tenantId: input.tenantId, channel: 'SMS', recipient: client.phone, triggerEvent: input.triggerEvent, relatedBookingId: input.relatedBookingId });
    return ok;
  }

  if (client.notificationChannel === 'WHATSAPP' && client.phone && whatsAppConfigured()) {
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
