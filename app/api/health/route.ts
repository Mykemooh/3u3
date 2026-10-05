import { NextResponse } from 'next/server';
import { checkHealth } from '@/lib/health';

export const dynamic = 'force-dynamic';

/** For uptime monitors: 200 while the app can reach its database, 503 when it can't. */
export async function GET() {
  const h = await checkHealth();
  return NextResponse.json(h, { status: h.database.ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
}
