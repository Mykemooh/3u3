import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getInvoiceWithItems, onlinePaymentsReady } from '@/lib/invoices';
import { createTipCheckoutSession, TipError } from '@/lib/tips';

const schema = z.object({ amountCents: z.number().int().positive() });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string; role?: string } | undefined;
  if (!user?.id) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const data = await getInvoiceWithItems(params.id);
  if (!data || data.invoice.clientId !== user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Pick a tip amount.' }, { status: 400 });

  // Tips go by card; with no card payments here yet, say so plainly.
  if (!(await onlinePaymentsReady(data.invoice.tenantId, parsed.data.amountCents))) {
    return NextResponse.json({ error: 'tips-unavailable' }, { status: 400 });
  }

  try {
    const { url } = await createTipCheckoutSession(params.id, parsed.data.amountCents);
    return NextResponse.json({ url });
  } catch (err) {
    if (err instanceof TipError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: 'Could not start that payment.' }, { status: 500 });
  }
}
