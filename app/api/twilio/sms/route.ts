import { NextResponse } from 'next/server';
import { receiveInbound } from '@/lib/messaging';
import { validTwilioSignature } from '@/lib/sms';
import { appUrl } from '@/lib/url';
import { texReplyToText } from '@/lib/tex';
import { chargeUsage } from '@/lib/billing/wallet';
import { smsSegments } from '@/lib/billing/plans';

export const dynamic = 'force-dynamic';

const twiml = (inner = '') =>
  new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`, { headers: { 'Content-Type': 'text/xml' } });

/**
 * Twilio → "A message comes in" webhook for the company's number
 * (Twilio console → Phone Numbers → Messaging → POST to
 * <site>/api/twilio/sms). Only requests carrying a valid Twilio
 * signature are accepted.
 */
export async function POST(req: Request) {
  const form = await req.formData();
  const params: Record<string, string> = {};
  form.forEach((v, k) => {
    params[k] = String(v);
  });
  const signature = req.headers.get('x-twilio-signature');
  const proto = req.headers.get('x-forwarded-proto') ?? 'https';
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  const candidates = [appUrl('/api/twilio/sms'), host ? `${proto}://${host}/api/twilio/sms` : null, req.url].filter(Boolean) as string[];
  if (!candidates.some((url) => validTwilioSignature(url, params, signature))) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
  }
  const got = await receiveInbound({ from: params.From ?? '', to: params.To ?? '', body: params.Body ?? '', sid: params.MessageSid ?? null });
  // Inbound texts are paid from credits too (lib/billing/wallet.ts). The
  // message is always kept and shown in the inbox; with no credits, Tex
  // just doesn't auto-reply.
  const inboundPaid = got ? (await chargeUsage(got.tenant.id, 'SMS', smsSegments(params.Body ?? ''), params.MessageSid ?? null)).ok : false;
  // Tex answers if the company turned it on — never to STOP/START, which
  // Twilio and the carriers answer themselves.
  if (got && inboundPaid && !got.consent && got.tenant.texSmsAutoReply) {
    await texReplyToText({ tenant: got.tenant, client: got.client, from: params.From ?? '', body: params.Body ?? '' }).catch((err) => console.error('[twilio/sms] Tex reply failed', err));
  }
  return twiml();
}
