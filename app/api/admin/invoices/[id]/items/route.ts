import { logChange } from '@/lib/audit';
import { belongsTo, notFound } from '@/lib/tenantGuard';
import { adminSession } from '@/lib/adminApi';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { replaceInvoiceItems, InvoiceError } from '@/lib/invoices';

const schema = z.object({
  items: z
    .array(
      z.object({
        description: z.string().min(1),
        // A minus amount is a credit or discount; the invoice total can't go below zero.
        amountCents: z.number().int().min(-10_000_000).max(10_000_000),
      }),
    )
    .min(1),
});

// Wholesale line-item replace, only while the invoice is still a DRAFT
// (lib/invoices.ts enforces this) — simpler than per-item add/remove
// endpoints for a small, admin-only editor.
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const guardAdmin = await adminSession();
  if (!guardAdmin) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }
  if (!(await belongsTo(guardAdmin.tenantId, 'invoice', params.id))) return notFound();
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  try {
    const totalCents = await replaceInvoiceItems(params.id, parsed.data.items);
    await logChange({ tenantId: guardAdmin.tenantId, actor: { id: guardAdmin.userId, name: guardAdmin.name }, entityType: 'invoice', entityId: params.id, action: 'updated', summary: `Edited the line items (total ${(totalCents / 100).toFixed(2)})` });
    return NextResponse.json({ ok: true, totalCents });
  } catch (err) {
    if (err instanceof InvoiceError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}
