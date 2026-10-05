import { logChange } from '@/lib/audit';
import { belongsTo, notFound } from '@/lib/tenantGuard';
import { adminSession } from '@/lib/adminApi';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { sendEstimate, EstimateError } from '@/lib/estimates';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const guardAdmin = await adminSession();
  if (!guardAdmin) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }
  if (!(await belongsTo(guardAdmin.tenantId, 'quote', params.id))) return notFound();

  try {
    // `emailed` is false when RESEND_API_KEY isn't set or the client has no
    // email on file. That's not a failure — the approval link still works,
    // so we hand it back for the admin to pass along by text or phone.
    const { url, emailed } = await sendEstimate(params.id);
    await logChange({ tenantId: guardAdmin.tenantId, actor: { id: guardAdmin.userId, name: guardAdmin.name }, entityType: 'quote', entityId: params.id, action: 'sent', summary: 'Sent the quote' });
    return NextResponse.json({ ok: true, url, emailed });
  } catch (err) {
    if (err instanceof EstimateError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: 'Something went wrong sending the estimate.' }, { status: 500 });
  }
}
