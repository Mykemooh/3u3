import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { verifyUnsubscribe } from '@/lib/unsubscribe';

const schema = z.object({ u: z.string().min(1), t: z.string().min(1), resubscribe: z.boolean().optional() });

/** Marketing opt-out (and back in). Reminders, invoices and visit updates are not affected. */
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success || !verifyUnsubscribe(parsed.data.u, parsed.data.t)) {
    return NextResponse.json({ error: 'This link is not valid.' }, { status: 400 });
  }
  await db.update(users).set({ marketingOptOut: !parsed.data.resubscribe }).where(eq(users.id, parsed.data.u));
  return NextResponse.json({ ok: true, optedOut: !parsed.data.resubscribe });
}
