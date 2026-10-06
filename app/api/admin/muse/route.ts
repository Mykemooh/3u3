import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminSession, forbidden } from '@/lib/adminApi';
import { brainstorm, listConcepts, suggestPlan, MuseError, CHANNELS } from '@/lib/muse';
import { getMeta, metaConfigured, maxDailyCents, publishProblems } from '@/lib/meta';
import { db } from '@/db/client';
import { adConcepts } from '@/db/schema';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET() {
  const admin = await adminSession('marketing.manage');
  if (!admin) return forbidden();
  const [concepts, plan, conn] = await Promise.all([listConcepts(admin.tenantId), suggestPlan(admin.tenantId), getMeta(admin.tenantId)]);
  return NextResponse.json({
    concepts: concepts.map((c) => ({ ...c, problems: c.channel === 'META' ? publishProblems(c, conn) : [] })),
    plan,
    meta: { configured: metaConfigured(), connected: !!conn, adAccount: conn?.adAccountName ?? null, page: conn?.pageName ?? null, maxDailyCents: maxDailyCents() },
    aiWriter: !!process.env.ANTHROPIC_API_KEY,
  });
}

const schema = z.object({ goal: z.string().min(3).max(400), channel: z.enum(CHANNELS).optional(), count: z.number().int().min(1).max(6).optional() });

export async function POST(req: Request) {
  const admin = await adminSession('marketing.manage');
  if (!admin) return forbidden();
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Tell Muse what you want — for example “book more deep cleans this month”.' }, { status: 400 });
  try {
    return NextResponse.json(await brainstorm(admin.tenantId, parsed.data, { id: admin.userId, name: admin.name }));
  } catch (err) {
    if (err instanceof MuseError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
