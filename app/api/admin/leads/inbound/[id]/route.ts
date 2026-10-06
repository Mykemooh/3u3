import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminSession, forbidden } from '@/lib/adminApi';
import { notFound } from '@/lib/tenantGuard';
import { setInboundLeadStatus, InboundLeadError } from '@/lib/inboundLeads';

const schema = z.object({ status: z.enum(['NEW', 'CONTACTED', 'CONVERTED', 'DISMISSED']) });

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const admin = await adminSession();
  if (!admin) return forbidden();
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Pick a status.' }, { status: 400 });
  try {
    // setInboundLeadStatus only finds the lead within this company.
    await setInboundLeadStatus(admin.tenantId, params.id, parsed.data.status, { id: admin.userId, name: admin.name });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof InboundLeadError && err.status === 404) return notFound();
    throw err;
  }
}
