import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminSession, forbidden } from '@/lib/adminApi';
import { editConcept, MuseError, CHANNELS } from '@/lib/muse';

const schema = z.object({
  title: z.string().min(1).max(120).optional(),
  headline: z.string().min(1).max(120).optional(),
  primaryText: z.string().min(1).max(900).optional(),
  cta: z.string().min(1).max(40).optional(),
  imagePrompt: z.string().max(300).optional(),
  audience: z.string().max(200).optional(),
  segment: z.enum(['ALL_ACTIVE', 'LAPSED', 'RECURRING', 'ONE_TIME', 'LEADS']).nullable().optional(),
  zips: z.string().max(400).nullable().optional(),
  dailyBudgetCents: z.number().int().min(0).max(1_000_000).nullable().optional(),
  channel: z.enum(CHANNELS).optional(),
  newImage: z.boolean().optional(),
  status: z.enum(['DRAFT', 'APPROVED', 'ARCHIVED']).optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const admin = await adminSession('marketing.manage');
  if (!admin) return forbidden();
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the fields and try again.' }, { status: 400 });
  try {
    await editConcept(admin.tenantId, params.id, parsed.data, { id: admin.userId, name: admin.name });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof MuseError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const admin = await adminSession('marketing.manage');
  if (!admin) return forbidden();
  try {
    await editConcept(admin.tenantId, params.id, { status: 'ARCHIVED' }, { id: admin.userId, name: admin.name });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof MuseError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
