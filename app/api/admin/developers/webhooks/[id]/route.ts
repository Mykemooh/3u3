import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminSession, forbidden } from '@/lib/adminApi';
import { belongsTo, notFound } from '@/lib/tenantGuard';
import { updateEndpoint, deleteEndpoint } from '@/lib/webhooks';
import { developersError } from '@/lib/developersApi';

const schema = z.object({
  url: z.string().min(1).max(500).optional(),
  description: z.string().max(120).nullable().optional(),
  events: z.array(z.string()).max(20).optional(),
  active: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const admin = await adminSession();
  if (!admin) return forbidden();
  if (!(await belongsTo(admin.tenantId, 'webhook', params.id))) return notFound();
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Check the address and events.' }, { status: 400 });
  try {
    await updateEndpoint(admin.tenantId, params.id, parsed.data, { id: admin.userId, name: admin.name });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return developersError(err);
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const admin = await adminSession();
  if (!admin) return forbidden();
  if (!(await belongsTo(admin.tenantId, 'webhook', params.id))) return notFound();
  try {
    await deleteEndpoint(admin.tenantId, params.id, { id: admin.userId, name: admin.name });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return developersError(err);
  }
}
