import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { tenants } from '@/db/schema';
import { adminSession, forbidden } from '@/lib/adminApi';
import { logChange } from '@/lib/audit';
import { quotingSchema } from '@/lib/quoting';

/** Settings → Quoting: how this company prices a home clean (lib/quoting.ts). */
export async function PUT(req: Request) {
  const admin = await adminSession('settings.manage');
  if (!admin) return forbidden();
  const parsed = quotingSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Check the numbers: one of them is out of range.' }, { status: 400 });
  const c = parsed.data;
  if (!c.rooms.on && !c.sqft.on && !c.hourly.on && !c.walkthrough.on) {
    return NextResponse.json({ error: 'Turn on at least one way to price the clean.' }, { status: 400 });
  }
  await db.update(tenants).set({ quotingJson: JSON.stringify(c) }).where(eq(tenants.id, admin.tenantId));
  const on = [c.rooms.on && 'rooms', c.sqft.on && 'square feet', c.hourly.on && 'hourly', c.walkthrough.on && 'walkthrough', c.clutter.on && 'clutter', c.pets.on && 'pets', c.frequency.on && 'repeat discount', c.deep.on && 'deep clean'].filter(Boolean);
  await logChange({
    tenantId: admin.tenantId,
    actor: { id: admin.userId, name: admin.name },
    entityType: 'settings',
    entityId: admin.tenantId,
    action: 'quoting.updated',
    summary: `Quoting methods updated: ${on.join(', ')}`,
  }).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
