import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminTenant, forbidden } from '@/lib/adminApi';
import { getAddressesFor } from '@/lib/data';
import { addRoomNote } from '@/lib/homeProfile';

const schema = z.object({ roomName: z.string().trim().min(1).max(60), notes: z.string().trim().min(1).max(500) });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const tenantId = await adminTenant();
  if (!tenantId) return forbidden();

  const addresses = await getAddressesFor(params.id);
  const address = addresses.find((a) => a.isPrimary) ?? addresses[0];
  if (!address) return NextResponse.json({ error: 'Add an address for this client first.' }, { status: 400 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Add a room name and a note.' }, { status: 400 });

  const note = await addRoomNote(address.id, parsed.data.roomName, parsed.data.notes);
  return NextResponse.json({ note });
}
