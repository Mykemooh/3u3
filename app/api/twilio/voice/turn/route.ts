import { NextResponse } from 'next/server';
import { tenantForInbound, clientByPhone } from '@/lib/messaging';
import { phoneDigits } from '@/lib/sms';
import { askTex } from '@/lib/tex';
import { twilioForm, twiml, say, gather, xml } from '@/lib/voice';

export const dynamic = 'force-dynamic';

/** One turn of a Tex phone call: what the caller said → Tex's answer, then listen again or transfer. */
export async function POST(req: Request) {
  const { ok, params } = await twilioForm(req, '/api/twilio/voice/turn');
  if (!ok) return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
  const tenant = await tenantForInbound(params.To ?? '', params.From ?? '');
  if (!tenant) return twiml(say('Sorry, this number is not set up yet.'));
  const speech = (params.SpeechResult ?? '').trim();
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
  if (reply.handoff) {
    if (tenant.ownerPhone) return twiml(say(reply.answer) + `<Dial timeout="25">${xml(tenant.ownerPhone)}</Dial>` + say('Sorry, no one could pick up. We’ll call you back at this number.'));
    return twiml(say(`${reply.answer} Someone from ${tenant.name} will call you back at this number. Goodbye.`));
  }
  return twiml(say(reply.answer) + gather('Is there anything else?') + say(`Thanks for calling ${tenant.name}. Goodbye.`));
}
