import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { eq } from 'drizzle-orm';
import { authOptions } from '@/lib/auth';
import { db } from '@/db/client';
import { users } from '@/db/schema';

const schema = z.object({ consent: z.boolean() });

// "Can we use your before/after photos on social media?" — asked once
// (app/account/jobs/[id]); this is the one-time answer, recorded for
// every future cleaning until the client changes it themselves (same
// endpoint, called again, just overwrites the previous answer).
export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string; role?: string } | undefined)?.id;
  if (!userId || (session?.user as any).role !== 'CUSTOMER') {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  await db
    .update(users)
    .set({ socialMediaConsent: parsed.data.consent, socialMediaConsentAt: new Date() })
    .where(eq(users.id, userId));

  return NextResponse.json({ consent: parsed.data.consent });
}
