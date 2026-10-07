import { normalizePhone, samePhone } from '@/lib/phone';
import { adminSession } from '@/lib/adminApi';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { db } from '@/db/client';
import { users, addresses } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
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
  // The client's language for emails and texts (users.locale).
  locale: z.enum(['en', 'es']).optional(),
});

// Direct client creation for the CRM (as opposed to a client arriving via
// the /new lead-capture flow) — e.g. a walk-in or phone-booked customer the
// admin is setting up manually.
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const tenantId = (session?.user as any)?.tenantId;
  if (!(await adminSession())) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Please fill in every required field.' }, { status: 400 });
  const { name, addressLine1, address: picked } = parsed.data;
  const phone = normalizePhone(parsed.data.phone);
  const email = parsed.data.email?.trim() || undefined;
  const locale = parsed.data.locale ?? 'en';

  // Phone numbers and emails sign people in, so each belongs to one account.
  const match = samePhone(phone);
  const existing = (await db.select().from(users).where(match ?? eq(users.phone, phone)).limit(1))[0];
  if (existing) {
    return NextResponse.json(
      existing.tenantId === tenantId
        ? { error: `${existing.name} already has that phone number.`, clientId: existing.role === 'CUSTOMER' ? existing.id : undefined }
        : { error: 'That phone number already signs in to another account, so it can’t be used for a new client here. Check the number, or use another one.' },
      { status: 409 },
    );
  }
  if (email) {
    const emailTaken = (await db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${email.toLowerCase()}`).limit(1))[0];
    if (emailTaken) return NextResponse.json({ error: 'That email is already used by another account. Leave it blank or use a different one.' }, { status: 409 });
  }

  const clientId = crypto.randomUUID();
  await db.insert(users).values({ id: clientId, tenantId, role: 'CUSTOMER', name, phone, email, locale });

  if (addressLine1) {
    await db.insert(addresses).values({ id: crypto.randomUUID(), userId: clientId, ...addressFields(picked, addressLine1) });
  }

  // Same password-setup invite a lead gets — this client just skipped the
  // lead-capture form because the office set them up directly.
  if (email) {
    try {
      const token = await issuePasswordSetupToken(clientId);
      const { subject, html } = passwordSetupEmail({ name, url: appUrl(`/set-password?token=${token}`), locale });
      await sendEmail({ to: email, subject, html });
    } catch (err) {
      console.error('[admin/clients] password setup email failed for', clientId, err);
    }
  }

  return NextResponse.json({ ok: true, clientId });
}
