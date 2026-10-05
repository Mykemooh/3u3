import { NextResponse } from 'next/server';
import { adminSession, forbidden } from '@/lib/adminApi';
import { getThread } from '@/lib/messaging';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { inArray } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

/** One conversation (the other party's 10 digits); opening it marks it read. */
export async function GET(_req: Request, { params }: { params: { key: string } }) {
  const admin = await adminSession();
  if (!admin) return forbidden();
  if (!/^\d{10}$/.test(params.key)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const rows = await getThread(admin.tenantId, params.key);
  const staffIds = [...new Set(rows.map((m) => m.sentByUserId).filter(Boolean))] as string[];
  const staff = staffIds.length ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, staffIds)) : [];
  return NextResponse.json({
    messages: rows.map((m) => ({
      id: m.id,
      direction: m.direction,
      body: m.body,
      at: m.createdAt.toISOString(),
      byTex: m.sentByTex,
      by: m.sentByUserId ? staff.find((s) => s.id === m.sentByUserId)?.name.split(' ')[0] ?? 'Team' : m.direction === 'OUT' && !m.sentByTex ? 'Automatic' : null,
    })),
  });
}
