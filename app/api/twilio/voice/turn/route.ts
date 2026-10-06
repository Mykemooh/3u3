import { NextResponse } from 'next/server';
import { tenantForInbound, clientByPhone } from '@/lib/messaging';
import { phoneDigits } from '@/lib/sms';
import { askTex } from '@/lib/tex';
import { appUrl } from '@/lib/url';
import { twilioForm, twiml, say, gather, xml, recordMessage } from '@/lib/voice';
import { isOpenNow } from '@/lib/time';
import { continueVoiceCall, dialTimeLimit } from '@/lib/billing/wallet';

export const dynamic = 'force-dynamic';

/** One turn of a Tex phone call: what the caller said → Tex's answer, then listen again or transfer. */
export async function POST(req: Request) {
  const { ok, params } = await twilioForm(req, '/api/twilio/voice/turn');
  if (!ok) return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
  const tenant = await tenantForInbound(params.To ?? '', params.From ?? '');
  if (!tenant) return twiml(say('Sorry, this number is not set up yet.'));
  // Pay for the minutes this call has run (lib/billing/wallet.ts). Out of
  // credits: Tex wraps up politely instead of running on unpaid time.
  if (params.CallSid && !(await continueVoiceCall(tenant.id, params.CallSid))) {
    return twiml(say(`I need to wrap up now. Someone from ${tenant.name} will follow up with you soon. Goodbye.`));
  }
  // Spoken words, or digits keyed on the phone (a PIN).
  const speech = (params.SpeechResult ?? '').trim() || (params.Digits ? `My PIN is ${params.Digits}` : '');
  if (!speech) return twiml(gather('Sorry, I didn’t catch that. What can I help with?') + say('Thanks for calling. Goodbye.'));

  const digits = phoneDigits(params.From);
  const client = digits ? await clientByPhone(digits, tenant.id) : undefined;
  const reply = await askTex({
    tenantId: tenant.id,
    audience: client ? 'CLIENT' : 'PUBLIC',
    channel: 'VOICE',
    conversationId: `voice:${params.CallSid ?? crypto.randomUUID()}`,
    message: speech,
    userId: client?.id ?? null,
    phone: params.From ?? null,
  }).catch(() => null);

  if (!reply) return twiml(say(`Sorry, I’m having trouble right now. Please text us at this number and someone from ${tenant.name} will get back to you.`));
  if (reply.transfer) {
    const open = isOpenNow(tenant.texOpenDays, tenant.texOpenFrom, tenant.texOpenTo);
    if (open && tenant.ownerPhone) {
      // If nobody picks up, the voicemail route takes a message.
      const limit = await dialTimeLimit(tenant.id);
      return twiml(say(reply.answer) + `<Dial timeout="25"${limit ? ` timeLimit="${limit}"` : ''} action="${xml(appUrl('/api/twilio/voice/voicemail'))}" method="POST">${xml(tenant.ownerPhone)}</Dial>`);
    }
    return twiml(say(`${reply.answer} Go ahead and leave a message after the beep and someone will call you back.`) + recordMessage());
  }
  return twiml(say(reply.answer) + gather(reply.handoff ? 'Anything else I can help with?' : 'Anything else?') + say(`Thanks for calling ${tenant.name}. Take care!`));
}
