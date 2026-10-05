import { NextResponse } from 'next/server';
import { adminSession, forbidden } from '@/lib/adminApi';
import { saveTemplate, templateSchema } from '@/lib/scheduleTemplates';
import { statusApiError } from '@/lib/api';


export async function POST(req: Request) {
  const admin = await adminSession();
  if (!admin) return forbidden();
  const parsed = templateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Check the template details.' }, { status: 400 });
  try {
    return NextResponse.json({ template: await saveTemplate(admin.tenantId, parsed.data) });
  } catch (err) {
    return statusApiError(err);
  }
}
