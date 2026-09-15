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
        amountCents: z.number().int().nonnegative(),
      }),
    )
    .min(1),
});

// Wholesale line-item replace, only while the invoice is still a DRAFT
// (lib/invoices.ts enforces this) — simpler than per-item add/remove
// endpoints for a small, admin-only editor.
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  try {
    const totalCents = await replaceInvoiceItems(params.id, parsed.data.items);
    return NextResponse.json({ ok: true, totalCents });
  } catch (err) {
    if (err instanceof InvoiceError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}
