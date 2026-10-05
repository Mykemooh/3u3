import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { db } from '@/db/client';
import { texMessages } from '@/db/schema';
import { and, eq, gte, like, sql } from 'drizzle-orm';
import { authOptions } from '@/lib/auth';
import { getTenant } from '@/lib/data';
import { askTex, TexError } from '@/lib/tex';
import { hashedIp } from '@/lib/signup';
import type { Audience } from '@/lib/help/content';

export const dynamic = 'force-dynamic';

const SUGGESTIONS: Record<Audience, string[]> = {
  PUBLIC: ['How is my price set?', 'Do I need to be home?', 'What areas do you serve?'],
  CLIENT: ['How do I reschedule?', 'Where are my photos?', 'Can I tip the crew?'],
  CREW: ['How do room timers work?', 'No signal in the home', 'When is payday?'],
  ADMIN: ['How do I run payroll?', 'How do I quote commercial?', 'How do I change a recurring clean?'],
};

async function who() {
  const user = (await getServerSession(authOptions).catch(() => null))?.user as { id?: string; role?: string; mfaPending?: boolean } | undefined;
  if (!user?.id || user.mfaPending) return { audience: 'PUBLIC' as Audience, userId: null };
  const audience: Audience = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN' ? 'ADMIN' : user.role === 'CLEANER' ? 'CREW' : 'CLIENT';
  return { audience, userId: user.id };
}

export async function GET() {
  const tenant = await getTenant();
  if (!tenant) return NextResponse.json({ enabled: false });
  const { audience } = await who();
  return NextResponse.json({ enabled: true, company: tenant.name, audience, suggestions: SUGGESTIONS[audience] });
}

const schema = z.object({ message: z.string().min(1).max(1000), conversationId: z.string().uuid() });

export async function POST(req: Request) {
  const tenant = await getTenant();
  if (!tenant) return NextResponse.json({ error: 'Not set up' }, { status: 500 });
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Ask Tex a question.' }, { status: 400 });
  const { audience, userId } = await who();
  // Signed-in people get their own thread; visitors are grouped by a hash
  // of their network address so one visitor can't run up the bill.
  const owner = userId ? `u-${userId}` : `ip-${hashedIp(req.headers.get('x-forwarded-for')) ?? 'unknown'}`;
  const conversationId = `web:${owner}:${parsed.data.conversationId}`;
  if (!userId) {
    const recent = await db
      .select({ n: sql<number>`count(*)` })
      .from(texMessages)
      .where(and(eq(texMessages.tenantId, tenant.id), like(texMessages.conversationId, `web:${owner}:%`), eq(texMessages.author, 'USER'), gte(texMessages.createdAt, new Date(Date.now() - 3600_000))));
    if (Number(recent[0]?.n ?? 0) >= 40) return NextResponse.json({ error: 'Tex needs a break — please call or text us instead.' }, { status: 429 });
  }
  try {
    const reply = await askTex({ tenantId: tenant.id, audience, channel: 'WEB', conversationId, message: parsed.data.message, userId });
    return NextResponse.json(reply);
  } catch (err) {
    if (err instanceof TexError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: 'Tex couldn’t answer just now.' }, { status: 500 });
  }
}
