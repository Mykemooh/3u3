import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
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

export async function GET() {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string; role?: string } | undefined;
  if (!user?.id || user.role !== 'CUSTOMER') return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const address = await requirePrimaryAddress(user.id);
  if (!address) return NextResponse.json({ profile: null });
  return NextResponse.json({ profile: await getHomeProfile(address.id) });
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string; role?: string } | undefined;
  if (!user?.id || user.role !== 'CUSTOMER') return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const address = await requirePrimaryAddress(user.id);
  if (!address) return NextResponse.json({ error: 'Add an address first.' }, { status: 400 });

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
