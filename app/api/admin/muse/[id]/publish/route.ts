import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminSession, forbidden } from '@/lib/adminApi';
import { publishPaused } from '@/lib/meta';
import { MuseError } from '@/lib/muse';

const schema = z.object({ days: z.number().int().min(1).max(30).default(7) });

/** Creates the ad in the owner's Facebook account — paused. They switch it on in Ads Manager. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const admin = await adminSession('marketing.manage');
  if (!admin) return forbidden();
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  try {
    return NextResponse.json(await publishPaused(admin.tenantId, params.id, parsed.success ? parsed.data.days : 7, { id: admin.userId, name: admin.name }));
  } catch (err) {
    if (err instanceof MuseError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
