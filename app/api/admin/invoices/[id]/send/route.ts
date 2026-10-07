import { logChange } from '@/lib/audit';
import { belongsTo, notFound } from '@/lib/tenantGuard';
import { adminSession } from '@/lib/adminApi';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { sendInvoice, InvoiceError } from '@/lib/invoices';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const guardAdmin = await adminSession();
  if (!guardAdmin) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }
  if (!(await belongsTo(guardAdmin.tenantId, 'invoice', params.id))) return notFound();

  try {
    const { url, online } = await sendInvoice(params.id);
    await logChange({ tenantId: guardAdmin.tenantId, actor: { id: guardAdmin.userId, name: guardAdmin.name }, entityType: 'invoice', entityId: params.id, action: 'sent', summary: online ? 'Sent the invoice' : 'Sent the invoice (no card payment link)' });
    return NextResponse.json({ ok: true, url, online });
  } catch (err) {
    if (err instanceof InvoiceError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: 'Something went wrong sending the invoice.' }, { status: 500 });
  }
}
