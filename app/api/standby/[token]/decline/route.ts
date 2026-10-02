import { NextResponse } from 'next/server';
import { declineStandbyOffer } from '@/lib/standby';

export async function POST(_req: Request, { params }: { params: { token: string } }) {
  await declineStandbyOffer(params.token);
  return NextResponse.json({ ok: true });
}
