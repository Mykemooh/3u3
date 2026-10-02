import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getTenant, getAddressesFor } from '@/lib/data';
import { createStandbyRequest } from '@/lib/standby';

const schema = z.object({
  serviceTypeId: z.string().min(1),
  preferredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  cadence: z.enum(['ONE_TIME', 'BIWEEKLY', 'MONTHLY']).default('ONE_TIME'),
});

// "Hold my spot" — created from the booking wizard when a client's
// first-choice day has nothing open and they book an alternative day
// instead (components/BookingCalendar.tsx).
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as any).role !== 'CUSTOMER') {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }
  const clientId = (session.user as any).id as string;
  const tenant = await getTenant();
  if (!tenant) return NextResponse.json({ error: 'Not set up' }, { status: 500 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  const addresses = await getAddressesFor(clientId);
  const id = await createStandbyRequest({
    tenantId: tenant.id,
    clientId,
    serviceTypeId: parsed.data.serviceTypeId,
    addressId: addresses[0]?.id,
    preferredDate: parsed.data.preferredDate,
    cadence: parsed.data.cadence,
  });
  return NextResponse.json({ id });
}
