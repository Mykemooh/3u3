import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import {
  createPaymentMethodSetupIntent,
  savePaymentMethodFromSetupIntent,
  removePaymentMethod,
  setAutopay,
  PaymentError,
} from '@/lib/payments';

function requireCustomer(session: any): string {
  const user = session?.user as { id?: string; role?: string } | undefined;
  if (!user?.id || user.role !== 'CUSTOMER') throw new PaymentError('Sign in required');
  return user.id;
}

function errorResponse(err: unknown) {
  if (err instanceof PaymentError) return NextResponse.json({ error: err.message }, { status: 400 });
  console.error(err);
  return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
}

// Step 1: start a SetupIntent for the Payment Element to confirm against.
export async function POST(_req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const clientId = requireCustomer(session);
    const { clientSecret } = await createPaymentMethodSetupIntent(clientId);
    return NextResponse.json({ clientSecret });
  } catch (err) {
    return errorResponse(err);
  }
}

const confirmSchema = z.object({ action: z.literal('confirm'), setupIntentId: z.string().min(1) });
const autopaySchema = z.object({ action: z.literal('autopay'), enabled: z.boolean() });
const schema = z.union([confirmSchema, autopaySchema]);

// Step 2 (after the browser confirms the SetupIntent with Stripe): persist
// the resulting payment method's display fields. Also doubles as the
// autopay on/off toggle, since both just update the same user row.
export async function PATCH(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const clientId = requireCustomer(session);
    const body = schema.parse(await req.json());
    if (body.action === 'confirm') {
      const saved = await savePaymentMethodFromSetupIntent(clientId, body.setupIntentId);
      return NextResponse.json(saved);
    }
    await setAutopay(clientId, body.enabled);
    return NextResponse.json({ autopayEnabled: body.enabled });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE() {
  try {
    const session = await getServerSession(authOptions);
    const clientId = requireCustomer(session);
    await removePaymentMethod(clientId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
