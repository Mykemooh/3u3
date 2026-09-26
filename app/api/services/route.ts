import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { serviceTypes } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getTenant } from '@/lib/data';
import { HIDDEN_SERVICE_KEYS } from '@/lib/services';

// Public endpoint (no auth) — lets the new-customer flow show the real
// tenant-configured service list (PRD section 2: Standard / Deep /
// Move-in-out / Airbnb turnover) instead of hardcoding it into the client.
// HIDDEN_SERVICE_KEYS are withdrawn from this list without touching the row.
export const dynamic = 'force-dynamic';

export async function GET() {
  const tenant = await getTenant();
  if (!tenant) return NextResponse.json({ error: 'Not set up' }, { status: 500 });

  const rows = await db.select().from(serviceTypes).where(eq(serviceTypes.tenantId, tenant.id));
  return NextResponse.json({
    services: rows
      .filter((s) => !HIDDEN_SERVICE_KEYS.includes(s.key))
      .map((s) => ({ id: s.id, key: s.key, name: s.name })),
  });
}
