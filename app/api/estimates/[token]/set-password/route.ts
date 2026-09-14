import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getEstimateByToken } from '@/lib/estimates';

const schema = z.object({ password: z.string().min(8).max(200) });

/**
 * Closes the one real gap between approving and booking: a lead captured at
 * /new has no password, so they could approve an estimate and then be
 * unable to sign in and pick a slot. Right after approval we let them set
 * one, authorised by the same estimate token.
 *
 * Deliberately one-shot — it only works on an APPROVED estimate for a
 * client who has no password yet, so a leaked estimate link can never be
 * used to reset the password on an established account.
 */
export async function POST(req: Request, { params }: { params: { token: string } }) {
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
  }

  const data = await getEstimateByToken(params.token);
  if (!data) return NextResponse.json({ error: 'This link is not valid' }, { status: 400 });
  const { quote, client } = data;

  if (quote.status !== 'APPROVED') {
    return NextResponse.json({ error: 'Approve the estimate first.' }, { status: 400 });
  }
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 400 });
  if (client.passwordHash) {
    return NextResponse.json({ error: 'You already have a password — please sign in.' }, { status: 400 });
  }
  if (!client.phone) {
    return NextResponse.json({ error: 'No phone number on file to sign in with.' }, { status: 400 });
  }

  await db
    .update(users)
    .set({ passwordHash: bcrypt.hashSync(parsed.data.password, 10) })
    .where(eq(users.id, client.id));

  return NextResponse.json({ ok: true, phone: client.phone });
}
