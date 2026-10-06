import { NextResponse } from 'next/server';
import { captureException, monitoringConfigured, safePath } from '@/lib/monitoring';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 8000;
const perIp = new Map<string, { n: number; at: number }>();

/**
 * Browser errors from components/ErrorReporter.tsx, forwarded to Sentry
 * (lib/monitoring.ts). Size-capped and rate-limited per address; does
 * nothing without SENTRY_DSN.
 */
export async function POST(req: Request) {
  if (!monitoringConfigured()) return new NextResponse(null, { status: 204 });
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const now = Date.now();
  const slot = perIp.get(ip);
  if (slot && now - slot.at < 60_000 && slot.n >= 10) return new NextResponse(null, { status: 429 });
  perIp.set(ip, slot && now - slot.at < 60_000 ? { n: slot.n + 1, at: slot.at } : { n: 1, at: now });
  if (perIp.size > 5000) perIp.clear();

  const text = await req.text();
  if (text.length > MAX_BYTES) return new NextResponse(null, { status: 413 });
  let body: { message?: unknown; stack?: unknown; name?: unknown; url?: unknown };
  try {
    body = JSON.parse(text);
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const err = new Error(String(body.message ?? 'Browser error').slice(0, 500));
  err.name = typeof body.name === 'string' ? body.name.slice(0, 80) : 'Error';
  err.stack = typeof body.stack === 'string' ? body.stack.slice(0, 4000) : undefined;
  await captureException(err, { platform: 'javascript', path: safePath(typeof body.url === 'string' ? body.url : undefined), tags: { side: 'browser' } });
  return new NextResponse(null, { status: 204 });
}
