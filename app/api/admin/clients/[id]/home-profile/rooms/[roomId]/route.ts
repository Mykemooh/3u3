import { NextResponse } from 'next/server';
import { adminTenant, forbidden } from '@/lib/adminApi';
import { getAddressesFor } from '@/lib/data';
import { deleteRoomNote } from '@/lib/homeProfile';

export async function DELETE(_req: Request, { params }: { params: { id: string; roomId: string } }) {
  const tenantId = await adminTenant();
  if (!tenantId) return forbidden();

  const addresses = await getAddressesFor(params.id);
  const address = addresses.find((a) => a.isPrimary) ?? addresses[0];
  if (!address) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await deleteRoomNote(params.roomId, address.id);
  return NextResponse.json({ ok: true });
}
