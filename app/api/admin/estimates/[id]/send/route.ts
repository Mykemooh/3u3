import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { sendEstimate, EstimateError } from '@/lib/estimates';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if ((session?.user as any)?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  try {
    // `emailed` is false when RESEND_API_KEY isn't set or the client has no
    // email on file. That's not a failure — the approval link still works,
    // so we hand it back for the admin to pass along by text or phone.
    const { url, emailed } = await sendEstimate(params.id);
    return NextResponse.json({ ok: true, url, emailed });
  } catch (err) {
    if (err instanceof EstimateError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: 'Something went wrong sending the estimate.' }, { status: 500 });
  }
}
