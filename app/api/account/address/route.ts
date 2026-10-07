import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { eq } from 'drizzle-orm';
import { authOptions } from '@/lib/auth';
import { db } from '@/db/client';
import { addresses } from '@/db/schema';
import { getAddressesFor, getTenant, getOwnerEmail, getUserById, attachAddressToOpenVisits } from '@/lib/data';
import { logNotification } from '@/lib/bookings';
import { sendEmail, clientAccountChangeOwnerEmail } from '@/lib/email';
import { appUrl } from '@/lib/url';

const schema = z.object({
  line1: z.string().trim().min(1),
  city: z.string().trim().min(1),
  state: z.string().trim().min(2),
  zip: z.string().trim().optional(),
  notes: z.string().trim().max(2000).optional(),
  bedrooms: z.number().int().min(1).max(20).nullable().optional(),
});

// Customer self-service address change. Updates their primary address in
// place (so existing/future bookings that reference it automatically pick
// up the change) and alerts the owner — real email plus an entry in the
// admin Alerts panel — since the crew's route may need to change.
export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as any).role !== 'CUSTOMER') {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }
  const clientId = (session.user as any).id as string;

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Please fill in a complete address.' }, { status: 400 });
  const { line1, city, state, zip, notes, bedrooms } = parsed.data;

  const tenant = await getTenant();
  if (!tenant) return NextResponse.json({ error: 'Not set up' }, { status: 500 });

  const existing = await getAddressesFor(clientId);
  const primary = existing.find((a) => a.isPrimary) ?? existing[0];
  const changed = !primary || primary.line1 !== line1 || primary.city !== city || primary.state !== state || primary.zip !== zip;

  if (primary) {
    await db.update(addresses).set({ line1, city, state, zip, notes: notes ?? null, bedrooms: bedrooms ?? null }).where(eq(addresses.id, primary.id));
  } else {
    await db.insert(addresses).values({ id: crypto.randomUUID(), userId: clientId, line1, city, state, zip, notes: notes ?? null, bedrooms: bedrooms ?? null, isPrimary: true });
  }
  await attachAddressToOpenVisits(clientId);

  if (changed) {
    const client = await getUserById(clientId);
    const summary = `Updated their address to ${line1}, ${city}, ${state}${zip ? ` ${zip}` : ''}.`;
    await logNotification({
      tenantId: tenant.id,
      channel: 'EMAIL',
      recipient: client?.name ?? 'A client',
      triggerEvent: `CUSTOMER_ADDRESS_CHANGED: ${summary}`,
    });
    const ownerEmail = await getOwnerEmail(tenant.id);
    if (ownerEmail && client) {
      const { subject, html } = clientAccountChangeOwnerEmail({
        clientName: client.name,
        clientPhone: client.phone ?? undefined,
        summary,
        manageUrl: appUrl(`/admin/clients/${client.id}`),
      });
      await sendEmail({ to: ownerEmail, subject, html });
    }
  }

  return NextResponse.json({ ok: true });
}
