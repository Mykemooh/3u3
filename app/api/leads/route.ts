import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db/client';
import { users, addresses } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getTenant } from '@/lib/data';
import { createQuoteVisitBooking, logNotification, DoubleBookingError } from '@/lib/bookings';

const schema = z.object({
  name: z.string().min(1),
  phone: z.string().min(7),
  email: z.string().email().optional(),
  addressLine1: z.string().min(1),
  slotStart: z.string(),
  slotEnd: z.string(),
});

// New-customer speed-to-lead capture (PRD 6.2): name, phone, address — no
// account, password, or payment. Immediately followed by quote-visit
// scheduling in the same request.
export async function POST(req: Request) {
  const tenant = await getTenant();
  if (!tenant) return NextResponse.json({ error: 'Not set up' }, { status: 500 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Please fill in every field.' }, { status: 400 });
  }
  const { name, phone, email, addressLine1, slotStart, slotEnd } = parsed.data;

  let user = (await db.select().from(users).where(eq(users.phone, phone)).limit(1))[0];
  if (!user) {
    const id = crypto.randomUUID();
    await db.insert(users).values({ id, tenantId: tenant.id, role: 'CUSTOMER', name, phone, email });
    user = (await db.select().from(users).where(eq(users.id, id)).limit(1))[0]!;
  } else if (email && !user.email) {
    await db.update(users).set({ email }).where(eq(users.id, user.id));
  }

  let address = (await db.select().from(addresses).where(eq(addresses.userId, user.id)).limit(1))[0];
  if (!address) {
    const id = crypto.randomUUID();
    await db.insert(addresses).values({ id, userId: user.id, line1: addressLine1 });
    address = (await db.select().from(addresses).where(eq(addresses.id, id)).limit(1))[0]!;
  }

  try {
    const bookingId = await createQuoteVisitBooking({
      tenantId: tenant.id,
      clientId: user.id,
      addressId: address.id,
      slotStart,
      slotEnd,
    });

    await logNotification({
      tenantId: tenant.id,
      channel: 'EMAIL',
      recipient: user.email ?? phone,
      triggerEvent: 'QUOTE_VISIT_CONFIRMATION_CUSTOMER',
      relatedBookingId: bookingId,
    });
    await logNotification({
      tenantId: tenant.id,
      channel: 'EMAIL',
      recipient: 'owner',
      triggerEvent: 'NEW_LEAD_OWNER_ALERT',
      relatedBookingId: bookingId,
    });

    return NextResponse.json({ bookingId, slotStart, slotEnd });
  } catch (err) {
    if (err instanceof DoubleBookingError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error(err);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
