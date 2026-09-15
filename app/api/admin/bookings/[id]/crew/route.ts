import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { reassignBookingCrew, DispatchError } from '@/lib/dispatch';

const schema = z.object({ crewId: z.string().min(1) });

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  try {
    await reassignBookingCrew(params.id, parsed.data.crewId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof DispatchError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: 'Could not move that job.' }, { status: 500 });
  }
}
