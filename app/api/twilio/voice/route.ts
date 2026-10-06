import { NextResponse } from 'next/server';
import { tenantForInbound, clientByPhone } from '@/lib/messaging';
import { phoneDigits } from '@/lib/sms';
import { isOpenNow } from '@/lib/time';
import { twilioForm, twiml, say, gather, xml } from '@/lib/voice';

export const dynamic = 'force-dynamic';

/**
 * Twilio → "A call comes in" for the company's number (POST
 * <site>/api/twilio/voice). Tex answers if the company turned it on;
 * otherwise the call goes straight to the owner's phone.
 */
export async function POST(req: Request) {
  const { ok, params } = await twilioForm(req, '/api/twilio/voice');
  if (!ok) return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
  const tenant = await tenantForInbound(params.To ?? '', params.From ?? '');
  if (!tenant) return twiml(say('Sorry, this number is not set up yet.'));
  if (!tenant.texVoiceEnabled) {
    return twiml(tenant.ownerPhone ? `<Dial>${xml(tenant.ownerPhone)}</Dial>` : say(`Thanks for calling ${tenant.name}. Please send us a text at this number and we will get right back to you.`));
  }
  const digits = phoneDigits(params.From);
  const client = digits ? await clientByPhone(digits, tenant.id) : undefined;
  const open = isOpenNow(tenant.texOpenDays, tenant.texOpenFrom, tenant.texOpenTo);
  const first = client?.name.split(' ')[0];
  const greeting =
    tenant.texGreeting?.trim() ||
    (first
      ? `Hi ${first}, thanks for calling ${tenant.name}. It’s Tex, the virtual assistant. What can I do for you?`
      : `Thanks for calling ${tenant.name}, this is Tex, the virtual assistant. How can I help you today?`);
  const closed = open || tenant.texGreeting?.trim() ? '' : ' The office is closed right now, but I can answer questions or take a message.';
  return twiml(
    gather(greeting + closed, `${tenant.name}, cleaning, deep clean, move out, reschedule, quote, walkthrough`) +
      say('Sorry, I didn’t catch that. You can text this number any time and we’ll get right back to you. Goodbye.'),
  );
}
