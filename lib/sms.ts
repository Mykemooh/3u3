// Text messages via Twilio (https://www.twilio.com), called over its REST
// API with fetch — the same no-SDK approach lib/email.ts takes with Resend.
//
// Optional: until TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and
// TWILIO_FROM_NUMBER are all set, sendSms() no-ops with a console warning
// and returns false, and callers fall back to email. Every send should
// still be logged with logNotification() (channel 'SMS') so
// notification_log keeps tracking what texts cost.
const SID = process.env.TWILIO_ACCOUNT_SID;
const AUTH = process.env.TWILIO_AUTH_TOKEN;
const FROM = process.env.TWILIO_FROM_NUMBER;

export function smsConfigured() {
  return !!(SID && AUTH && FROM);
}

/**
 * Phone numbers are stored as the client typed them ("281-555-0199",
 * "(281) 555 0199", "+12815550199"...). Twilio needs E.164. US numbers
 * only for now — the business serves Katy/Houston.
 */
export function toE164(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

export async function sendSms(input: { to: string; body: string }): Promise<boolean> {
  const to = toE164(input.to);
  if (!smsConfigured()) {
    console.warn(`[sms] Twilio not configured — would have texted ${input.to}: "${input.body}"`);
    return false;
  }
  if (!to) {
    console.warn(`[sms] can't text "${input.to}" — not a US phone number`);
    return false;
  }
  return sendTwilioMessage(FROM!, to, input.body, 'sms');
}

// WhatsApp joins Email/SMS as a notification channel (My Account →
// notification preference). Same Twilio account, a separate "from" sender
// that has to be WhatsApp-enabled: Twilio's sandbox number works free for
// development (the recipient first sends the sandbox's join code once);
// a real business number needs WhatsApp Business verification through
// Twilio/Meta, which is free to apply for but has to be approved before
// production messages outside an active 24-hour conversation will
// deliver with freeform text. Until TWILIO_WHATSAPP_FROM is set,
// sendWhatsApp() no-ops exactly like sendSms() does without Twilio
// configured at all.
const WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM;

export function whatsAppConfigured() {
  return !!(SID && AUTH && WHATSAPP_FROM);
}

export async function sendWhatsApp(input: { to: string; body: string }): Promise<boolean> {
  const to = toE164(input.to);
  if (!whatsAppConfigured()) {
    console.warn(`[whatsapp] Twilio WhatsApp not configured — would have messaged ${input.to}: "${input.body}"`);
    return false;
  }
  if (!to) {
    console.warn(`[whatsapp] can't message "${input.to}" — not a US phone number`);
    return false;
  }
  return sendTwilioMessage(`whatsapp:${WHATSAPP_FROM}`, `whatsapp:${to}`, input.body, 'whatsapp');
}

async function sendTwilioMessage(from: string, to: string, body: string, label: 'sms' | 'whatsapp'): Promise<boolean> {
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${SID}:${AUTH}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }),
    });
    if (!res.ok) {
      console.error(`[${label}] Twilio rejected the request:`, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[${label}] send failed:`, err);
    return false;
  }
}
