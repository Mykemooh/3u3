import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { sendInvoice, InvoiceError } from '@/lib/invoices';
import { isStripeConfigured } from '@/lib/stripe';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: 'Stripe is not configured yet — add STRIPE_SECRET_KEY before sending invoices.' },
      { status: 400 },
    );
  }

  try {
    const { url } = await sendInvoice(params.id);
    return NextResponse.json({ ok: true, url });
  } catch (err) {
    if (err instanceof InvoiceError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: 'Something went wrong sending the invoice.' }, { status: 500 });
  }
}
