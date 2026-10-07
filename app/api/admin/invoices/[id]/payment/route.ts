import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminSession } from '@/lib/adminApi';
import { belongsTo, notFound } from '@/lib/tenantGuard';
import { recordOfflinePayment, InvoiceError, OFFLINE_METHODS } from '@/lib/invoices';

const schema = z.object({ method: z.enum(OFFLINE_METHODS), note: z.string().max(200).optional() });

/** Record a payment taken outside TRASHCAN — cash, check, a bank transfer. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const admin = await adminSession();
  if (!admin) return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  if (!(await belongsTo(admin.tenantId, 'invoice', params.id))) return notFound();
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Pick how the client paid.' }, { status: 400 });
  try {
    await recordOfflinePayment(params.id, admin.tenantId, parsed.data.method, { id: admin.userId, name: admin.name }, parsed.data.note?.trim() || undefined);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof InvoiceError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error('[invoices] record payment failed', err);
    return NextResponse.json({ error: 'Could not record the payment. Try again.' }, { status: 500 });
  }
}
