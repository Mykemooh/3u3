import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { cancelStandbyRequest, StandbyError } from '@/lib/standby';

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const clientId = (session?.user as { id?: string; role?: string } | undefined)?.id;
  if (!clientId || (session?.user as any).role !== 'CUSTOMER') {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }
  try {
    await cancelStandbyRequest(params.id, clientId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof StandbyError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}
