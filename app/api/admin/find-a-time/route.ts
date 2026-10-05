import { NextResponse } from 'next/server';
import { adminSession, forbidden } from '@/lib/adminApi';
import { findATime } from '@/lib/findATime';

/** Open slots across teams for a clean of a given length, best first. */
export async function GET(req: Request) {
  const admin = await adminSession();
  if (!admin) return forbidden();
  const url = new URL(req.url);
  const duration = Number(url.searchParams.get('duration'));
  if (!Number.isFinite(duration) || duration < 15) return NextResponse.json({ error: 'How long is the clean?' }, { status: 400 });
  const pref = url.searchParams.get('pref');
  const suggestions = await findATime({
    tenantId: admin.tenantId,
    durationMinutes: duration,
    zip: url.searchParams.get('zip'),
    preferredStartMinutes: pref ? Number(pref) : null,
    fromDate: url.searchParams.get('from') ?? undefined,
    crewId: url.searchParams.get('crewId'),
  });
  return NextResponse.json({ suggestions });
}
