import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getAddressesFor } from '@/lib/data';
import { deleteRoomNote } from '@/lib/homeProfile';

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string; role?: string } | undefined;
  if (!user?.id || user.role !== 'CUSTOMER') return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const addresses = await getAddressesFor(user.id);
  const address = addresses.find((a) => a.isPrimary) ?? addresses[0];
  if (!address) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await deleteRoomNote(params.id, address.id);
  return NextResponse.json({ ok: true });
}
