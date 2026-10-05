import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminSession, forbidden } from '@/lib/adminApi';
import { updateCampaign, deleteCampaign, MarketingError } from '@/lib/marketing';

const schema = z.object({
  name: z.string().min(1).max(120).optional(),
  segment: z.enum(['ALL_ACTIVE', 'LAPSED', 'RECURRING', 'ONE_TIME', 'LEADS']).optional(),
  subject: z.string().min(1).max(140).optional(),
  body: z.string().min(1).max(5000).optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const admin = await adminSession();
  if (!admin) return forbidden();
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Check the details.' }, { status: 400 });
  try {
    await updateCampaign(admin.tenantId, params.id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof MarketingError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const admin = await adminSession();
  if (!admin) return forbidden();
  try {
    await deleteCampaign(admin.tenantId, params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof MarketingError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
