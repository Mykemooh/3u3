import { NextResponse } from 'next/server';
import { acceptStandbyOffer, StandbyError } from '@/lib/standby';

// Capability-token link from the standby offer email/text — same pattern
// as estimate approval (lib/estimates.ts), no session required: the
// booking is created under the request's own clientId, not a logged-in
// session, so this works equally well from an SMS link on someone's phone.
export async function POST(_req: Request, { params }: { params: { token: string } }) {
  try {
    const { bookingId } = await acceptStandbyOffer(params.token);
    return NextResponse.json({ bookingId });
  } catch (err) {
    if (err instanceof StandbyError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
