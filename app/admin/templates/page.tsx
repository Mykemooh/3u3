import { getTenant } from '@/lib/data';
import { listTemplates } from '@/lib/scheduleTemplates';
import { db } from '@/db/client';
import { crews, serviceTypes } from '@/db/schema';
import { eq } from 'drizzle-orm';
import TemplatesManager from '@/components/admin/TemplatesManager';

export const dynamic = 'force-dynamic';

export default async function TemplatesPage() {
  const tenant = await getTenant();
  if (!tenant) return null;
  const [templates, services, crewRows] = await Promise.all([
    listTemplates(tenant.id),
    db.select().from(serviceTypes).where(eq(serviceTypes.tenantId, tenant.id)),
    db.select().from(crews).where(eq(crews.tenantId, tenant.id)),
  ]);
  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-2xl font-bold text-ink">Schedule templates</h2>
        <p className="max-w-2xl text-slate">
          A template holds everything a kind of clean usually needs. Pick one when you schedule and the length, repeat,
          start time, team and notes fill themselves in.
        </p>
      </div>
      <TemplatesManager
        templates={templates.map((t) => ({ ...t }))}
        services={services.map((s) => ({ id: s.id, name: s.name }))}
        crews={crewRows.map((c) => ({ id: c.id, name: c.name }))}
      />
    </div>
  );
}
