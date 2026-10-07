import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { adminTenant, forbidden } from '@/lib/adminApi';
import { db } from '@/db/client';
import { users } from '@/db/schema';

const schema = z.object({
  name: z.string().trim().min(1).optional(),
  phone: z.string().trim().min(1).optional(),
  email: z.string().trim().email().optional().or(z.literal('')),
  isActive: z.boolean().optional(),
  // Language for this client's emails and texts.
  locale: z.enum(['en', 'es']).optional(),
});

// Admin edits a client's own info (name/phone/email) and closes/reopens
// their account. Closing blocks sign-in and new bookings but keeps their
// history intact — it never touches existing bookings.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const tenantId = await adminTenant();
  if (!tenantId) return forbidden();

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  const client = (
    await db.select().from(users).where(and(eq(users.id, params.id), eq(users.tenantId, tenantId))).limit(1)
  )[0];
  if (!client || client.role !== 'CUSTOMER') {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  }

  const updates: Partial<typeof users.$inferInsert> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.phone !== undefined) updates.phone = parsed.data.phone;
  if (parsed.data.email !== undefined) updates.email = parsed.data.email || null;
  if (parsed.data.isActive !== undefined) updates.isActive = parsed.data.isActive;
  if (parsed.data.locale !== undefined) updates.locale = parsed.data.locale;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  try {
    await db.update(users).set(updates).where(eq(users.id, params.id));
  } catch (err: any) {
    if (err?.code === '23505') {
      return NextResponse.json({ error: 'That phone number or email is already in use.' }, { status: 409 });
    }
    console.error(err);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
