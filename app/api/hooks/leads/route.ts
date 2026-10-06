import { NextResponse } from 'next/server';
import { authenticateApiKey } from '@/lib/apiKeys';
import { receiveLead, InboundLeadError } from '@/lib/inboundLeads';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 16_000;

/**
 * Inbound lead webhook: Angi, Thumbtack, Facebook Lead Ads or a website
 * form (usually via Zapier or Make) creates a lead in one company's
 * account. Authenticated with that company's API key
 * (Authorization: Bearer tc_live_…, or X-Api-Key). JSON or form-encoded.
 *
 * 201 { id, duplicate: false } — a new lead
 * 200 { id, duplicate: true }  — added to an open lead with the same phone or email
 */
export async function POST(req: Request) {
  const auth = await authenticateApiKey(req);
  if (!auth) return NextResponse.json({ error: 'Missing or invalid API key.' }, { status: 401 });

  const text = await req.text();
  if (text.length > MAX_BYTES) return NextResponse.json({ error: 'That request is too large.' }, { status: 413 });
  let raw: Record<string, unknown>;
  try {
    const type = req.headers.get('content-type') ?? '';
    raw = type.includes('application/x-www-form-urlencoded') ? Object.fromEntries(new URLSearchParams(text)) : JSON.parse(text || '{}');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('not an object');
  } catch {
    return NextResponse.json({ error: 'Send the lead as a JSON object.' }, { status: 400 });
  }

  try {
    const result = await receiveLead(auth.tenantId, raw, auth.keyId);
    return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (err) {
    if (err instanceof InboundLeadError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('[hooks/leads]', err);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
