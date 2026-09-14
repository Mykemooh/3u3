import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { createDraftEstimate, EstimateError } from '@/lib/estimates';
import { getTenant } from '@/lib/data';

const schema = z.object({
  clientId: z.string().min(1),
  serviceTypeId: z.string().min(1),
  quoteVisitBookingId: z.string().min(1).optional(),
});

// Starts the estimate an admin writes up after a walkthrough. Returns the
// estimate id so the caller can navigate straight into the editor.
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  const tenant = await getTenant();
  if (!tenant) return NextResponse.json({ error: 'No tenant configured' }, { status: 500 });

  try {
    const quoteId = await createDraftEstimate({ tenantId: tenant.id, ...parsed.data });
    return NextResponse.json({ ok: true, quoteId });
  } catch (err) {
    if (err instanceof EstimateError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}
