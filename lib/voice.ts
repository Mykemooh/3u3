import { validTwilioSignature } from '@/lib/sms';
import { appUrl } from '@/lib/url';

/** TwiML helpers for Tex on the phone (app/api/twilio/voice). */
export const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const say = (s: string) => `<Say voice="Polly.Joanna">${xml(s)}</Say>`;
export const twiml = (inner: string) => new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`, { headers: { 'Content-Type': 'text/xml' } });
export const gather = (prompt: string) =>
  `<Gather input="speech" action="${xml(appUrl('/api/twilio/voice/turn'))}" method="POST" speechTimeout="auto" language="en-US">${say(prompt)}</Gather>`;

/** Reads a Twilio webhook's form and checks its signature against the URLs it could have been sent to. */
export async function twilioForm(req: Request, path: string) {
  const form = await req.formData();
  const params: Record<string, string> = {};
  form.forEach((v, k) => {
    params[k] = String(v);
  });
  const proto = req.headers.get('x-forwarded-proto') ?? 'https';
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  const urls = [appUrl(path), host ? `${proto}://${host}${path}` : null, req.url].filter(Boolean) as string[];
  const ok = urls.some((u) => validTwilioSignature(u, params, req.headers.get('x-twilio-signature')));
  return { ok, params };
}
