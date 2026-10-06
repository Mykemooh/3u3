import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { notificationLog } from '@/db/schema';
import { phoneDigits } from '@/lib/sms';
import { clientByPhone, tenantForInbound } from '@/lib/messaging';
import { twilioForm, twiml, say, recordMessage } from '@/lib/voice';
import { continueVoiceCall } from '@/lib/billing/wallet';

export const dynamic = 'force-dynamic';

/**
 * Where a call lands when nobody could pick up (the owner's phone didn't
 * answer) and where a recorded message is saved. Twilio posts here twice:
 * once when the transfer ends, once when the recording is done.
 */
export async function POST(req: Request) {
  const { ok, params } = await twilioForm(req, '/api/twilio/voice/voicemail');
  if (!ok) return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
  const tenant = await tenantForInbound(params.To ?? '', params.From ?? '');
  if (!tenant) return twiml(say('Sorry, this number is not set up yet.'));
  // Settle the minutes a transfer or message ran (lib/billing/wallet.ts).
  const paid = params.CallSid ? await continueVoiceCall(tenant.id, params.CallSid).catch(() => true) : true;

  if (params.RecordingUrl) {
    const digits = phoneDigits(params.From);
    const client = digits ? await clientByPhone(digits, tenant.id) : undefined;
    await db.insert(notificationLog).values({
      id: crypto.randomUUID(),
      tenantId: tenant.id,
      channel: 'SMS',
      recipient: 'admin',
      triggerEvent: `TEX_VOICEMAIL: ${client?.name ?? params.From ?? 'A caller'} left a ${params.RecordingDuration ?? '?'}s message: ${params.RecordingUrl}.mp3`.slice(0, 500),
      isRead: false,
    });
    return twiml(say('Got it, thanks. Someone will get back to you soon. Bye now!'));
  }
  if (params.DialCallStatus === 'completed' || params.DialCallStatus === 'answered') return twiml('');
  if (!paid) return twiml(say(`Sorry, nobody could pick up just now. Someone from ${tenant.name} will follow up soon. Goodbye.`));
  return twiml(say(`Sorry, nobody could pick up just now. Leave a message after the beep and someone from ${tenant.name} will call you back.`) + recordMessage());
}
