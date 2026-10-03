import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getAddressesFor } from '@/lib/data';
import { addRoomNote } from '@/lib/homeProfile';

const schema = z.object({ roomName: z.string().trim().min(1).max(60), notes: z.string().trim().min(1).max(500) });

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string; role?: string } | undefined;
  if (!user?.id || user.role !== 'CUSTOMER') return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const addresses = await getAddressesFor(user.id);
  const address = addresses.find((a) => a.isPrimary) ?? addresses[0];
  if (!address) return NextResponse.json({ error: 'Add an address first.' }, { status: 400 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Add a room name and a note.' }, { status: 400 });

  const note = await addRoomNote(address.id, parsed.data.roomName, parsed.data.notes);
  return NextResponse.json({ note });
}
