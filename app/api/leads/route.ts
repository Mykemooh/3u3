import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db/client';
import { users, addresses, serviceTypes } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getTenant, getOwnerEmail } from '@/lib/data';
import { createQuoteVisitBooking, logNotification, DoubleBookingError } from '@/lib/bookings';
import { sendEmail, quoteVisitCustomerEmail, newLeadOwnerEmail } from '@/lib/email';
import { formatDateLabel, formatSlotLabel } from '@/lib/scheduling';

const schema = z.object({
  name: z.string().min(1),
  phone: z.string().min(7),
  // Required: the estimate, its approval link and every later
  // notification all travel by email. A lead without one is a dead end.
  email: z.string().email(),
  addressLine1: z.string().min(1),
  serviceTypeId: z.string().min(1),
  slotStart: z.string(),
  slotEnd: z.string(),
});

// New-customer speed-to-lead capture (PRD 6.2): name, phone, address — no
// account, password, or payment. The service the customer is interested in
// (PRD section 2's service list) is captured up front too, so the owner
// knows what they're walking into; quote-visit scheduling happens in the
// same request, immediately after.
export async function POST(req: Request) {
  const tenant = await getTenant();
  if (!tenant) return NextResponse.json({ error: 'Not set up' }, { status: 500 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Please fill in every field.' }, { status: 400 });
  }
  const { name, phone, email, addressLine1, serviceTypeId, slotStart, slotEnd } = parsed.data;

  const service = (await db.select().from(serviceTypes).where(eq(serviceTypes.id, serviceTypeId)).limit(1))[0];
  if (!service || service.tenantId !== tenant.id) {
    return NextResponse.json({ error: 'Please choose a service.' }, { status: 400 });
  }

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
      serviceTypeId: service.id,
      slotStart,
      slotEnd,
    });

    const dateLabel = formatDateLabel(slotStart.split('T')[0]);
    const timeLabel = formatSlotLabel(slotStart, slotEnd);
    const customerEmail = email ?? user.email ?? undefined;

    // Customer confirmation (PRD 6.2/6.6) — best-effort: email is optional
    // at capture time to keep the form fast, so we only actually send when
    // we have an address to send to. The lead and its visit time are saved
    // either way.
    await logNotification({
      tenantId: tenant.id,
      channel: 'EMAIL',
      recipient: customerEmail ?? phone,
      triggerEvent: 'QUOTE_VISIT_CONFIRMATION_CUSTOMER',
      relatedBookingId: bookingId,
    });
    let customerEmailSent = false;
    if (customerEmail) {
      const { subject, html } = quoteVisitCustomerEmail({ name, serviceName: service.name, dateLabel, timeLabel });
      customerEmailSent = await sendEmail({ to: customerEmail, subject, html });
    }

    // Owner instant notification (PRD 6.6) — always attempted, independent
    // of whether the customer gave an email.
    const ownerEmail = await getOwnerEmail(tenant.id);
    await logNotification({
      tenantId: tenant.id,
      channel: 'EMAIL',
      recipient: ownerEmail ?? 'owner',
      triggerEvent: 'NEW_LEAD_OWNER_ALERT',
      relatedBookingId: bookingId,
    });
    if (ownerEmail) {
      const { subject, html } = newLeadOwnerEmail({
        name,
        phone,
        email: customerEmail,
        address: addressLine1,
        serviceName: service.name,
        dateLabel,
        timeLabel,
      });
      await sendEmail({ to: ownerEmail, subject, html });
    }

    return NextResponse.json({ bookingId, slotStart, slotEnd, customerEmailSent });
  } catch (err) {
    if (err instanceof DoubleBookingError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error(err);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
