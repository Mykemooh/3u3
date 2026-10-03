import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminTenant, forbidden } from '@/lib/adminApi';
import { getAddressesFor } from '@/lib/data';
import { getHomeProfile, updateHomeProfile, HomeProfileError } from '@/lib/homeProfile';

const schema = z.object({
  notes: z.string().trim().max(2000).nullable().optional(),
  pets: z.string().trim().max(500).nullable().optional(),
  parkingNotes: z.string().trim().max(500).nullable().optional(),
  allergyNotes: z.string().trim().max(500).nullable().optional(),
  doNotTouch: z.string().trim().max(500).nullable().optional(),
  entryCode: z.string().trim().max(100).nullable().optional(),
});

async function requirePrimaryAddress(clientId: string) {
  const addresses = await getAddressesFor(clientId);
  return addresses.find((a) => a.isPrimary) ?? addresses[0];
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const tenantId = await adminTenant();
  if (!tenantId) return forbidden();
  const address = await requirePrimaryAddress(params.id);
  if (!address) return NextResponse.json({ profile: null, addressId: null });
  return NextResponse.json({ profile: await getHomeProfile(address.id), addressId: address.id });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const tenantId = await adminTenant();
  if (!tenantId) return forbidden();

  const address = await requirePrimaryAddress(params.id);
  if (!address) return NextResponse.json({ error: 'Add an address for this client first.' }, { status: 400 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  try {
    await updateHomeProfile(address.id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof HomeProfileError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}
