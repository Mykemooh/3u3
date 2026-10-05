import { belongsTo, notFound } from '@/lib/tenantGuard';
import { adminSession } from '@/lib/adminApi';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { updateDraftEstimate, EstimateError } from '@/lib/estimates';

const schema = z.object({
  items: z
    .array(
      z.object({
        description: z.string().min(1),
        amountCents: z.number().int().nonnegative(),
      }),
    )
    .min(1),
  notes: z.string().max(2000).optional(),
  serviceTypeId: z.string().min(1).optional(),
});

// Wholesale replace of a DRAFT estimate's line items, plus the optional
// note to the client and the service it's for (lib/estimates.ts enforces
// draft-only). Same shape as the invoice editor's save endpoint.
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const guardAdmin = await adminSession();
  if (!guardAdmin) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }
  if (!(await belongsTo(guardAdmin.tenantId, 'quote', params.id))) return notFound();
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  try {
    const totalCents = await updateDraftEstimate(params.id, parsed.data);
    return NextResponse.json({ ok: true, totalCents });
  } catch (err) {
    if (err instanceof EstimateError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}
