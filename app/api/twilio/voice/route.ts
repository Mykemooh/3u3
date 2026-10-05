import { NextResponse } from 'next/server';
import { tenantForInbound } from '@/lib/messaging';
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
  return twiml(
    gather(`Hi, thanks for calling ${tenant.name}. I'm Tex, the virtual receptionist. How can I help? You can also say "a person" at any time.`) +
      say('Sorry, I didn’t catch that. Please text us at this number and we’ll get back to you. Goodbye.'),
  );
}
