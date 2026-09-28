import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { db } from '@/db/client';
import { users, addresses } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { issuePasswordSetupToken } from '@/lib/passwordSetup';
import { sendEmail, passwordSetupEmail } from '@/lib/email';
import { appUrl } from '@/lib/url';
import { pickedAddressSchema, addressFields } from '@/lib/addresses';

const schema = z.object({
  name: z.string().min(1),
  phone: z.string().min(7),
  email: z.string().email().optional(),
  addressLine1: z.string().min(1).optional(),
  address: pickedAddressSchema.optional(),
});

// Direct client creation for the CRM (as opposed to a client arriving via
// the /new lead-capture flow) — e.g. a walk-in or phone-booked customer the
// admin is setting up manually.
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const tenantId = (session?.user as any)?.tenantId;
  if ((session?.user as any)?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Please fill in every required field.' }, { status: 400 });
  const { name, phone, email, addressLine1, address: picked } = parsed.data;

  const existing = (await db.select().from(users).where(eq(users.phone, phone)).limit(1))[0];
  if (existing) {
    return NextResponse.json({ error: 'A client with that phone number already exists.' }, { status: 409 });
  }

  const clientId = crypto.randomUUID();
  await db.insert(users).values({ id: clientId, tenantId, role: 'CUSTOMER', name, phone, email });

  if (addressLine1) {
    await db.insert(addresses).values({ id: crypto.randomUUID(), userId: clientId, ...addressFields(picked, addressLine1) });
  }

  // Same password-setup invite a lead gets — this client just skipped the
  // lead-capture form because the office set them up directly.
  if (email) {
    try {
      const token = await issuePasswordSetupToken(clientId);
      const { subject, html } = passwordSetupEmail({ name, url: appUrl(`/set-password?token=${token}`) });
      await sendEmail({ to: email, subject, html });
    } catch (err) {
      console.error('[admin/clients] password setup email failed for', clientId, err);
    }
  }

  return NextResponse.json({ ok: true, clientId });
}
