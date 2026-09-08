import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { bookings } from '@/db/schema';
import { generateUpcomingQuoteVisitSlots } from '@/lib/scheduling';
import { getTenant } from '@/lib/data';
import { eq } from 'drizzle-orm';

// Reads live booking data — must run per-request, never statically cached
// at build time (Next.js would otherwise optimize this into a static
// response since it has no request-derived input).
export const dynamic = 'force-dynamic';

export async function GET() {
  const tenant = await getTenant();
  if (!tenant) return NextResponse.json({ error: 'Not set up' }, { status: 500 });

  const rows = await db.select().from(bookings).where(eq(bookings.tenantId, tenant.id));
  const existing = rows
    .filter((b) => b.isQuoteVisit && b.status !== 'CANCELLED')
    .map((b) => b.slotStart);

  const days = generateUpcomingQuoteVisitSlots(existing, 10);
  return NextResponse.json({ days });
}
