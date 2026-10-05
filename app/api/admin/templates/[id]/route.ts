import { NextResponse } from 'next/server';
import { adminSession, forbidden } from '@/lib/adminApi';
import { saveTemplate, deleteTemplate, copyTemplate, templateSchema } from '@/lib/scheduleTemplates';
import { statusApiError } from '@/lib/api';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const admin = await adminSession();
  if (!admin) return forbidden();
  const parsed = templateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Check the template details.' }, { status: 400 });
  try {
    return NextResponse.json({ template: await saveTemplate(admin.tenantId, parsed.data, params.id) });
  } catch (err) {
    return statusApiError(err);
  }
}

/** Copy a template (POST with {action: "copy"}). */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const admin = await adminSession();
  if (!admin) return forbidden();
  try {
    return NextResponse.json({ template: await copyTemplate(admin.tenantId, params.id) });
  } catch (err) {
    return statusApiError(err);
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const admin = await adminSession();
  if (!admin) return forbidden();
  await deleteTemplate(admin.tenantId, params.id);
  return NextResponse.json({ ok: true });
}
