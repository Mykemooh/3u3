import { db } from '@/db/client';
import { users, addresses, clientRates, crews, serviceTypes } from '@/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { getTenant } from '@/lib/data';
import { listTemplates } from '@/lib/scheduleTemplates';
import { addDays } from '@/lib/recurring';
import { businessTodayISO } from '@/lib/time';
import ScheduleCleanForm from '@/components/admin/ScheduleCleanForm';

export const dynamic = 'force-dynamic';

export default async function NewCleanPage({ searchParams }: { searchParams: { client?: string } }) {
  const tenant = await getTenant();
  if (!tenant) return null;
  const [clientRows, services, crewRows, templates] = await Promise.all([
    db.select().from(users).where(and(eq(users.tenantId, tenant.id), eq(users.role, 'CUSTOMER'), eq(users.isActive, true))),
    db.select().from(serviceTypes).where(eq(serviceTypes.tenantId, tenant.id)),
    db.select().from(crews).where(eq(crews.tenantId, tenant.id)),
    listTemplates(tenant.id),
  ]);
  const ids = clientRows.map((c) => c.id);
  const [addrRows, rateRows] = ids.length
    ? await Promise.all([
        db.select().from(addresses).where(inArray(addresses.userId, ids)),
        db.select().from(clientRates).where(inArray(clientRates.userId, ids)),
      ])
    : [[], []];

  const clients = clientRows
    .map((c) => {
      const a = addrRows.find((x) => x.userId === c.id && x.isPrimary) ?? addrRows.find((x) => x.userId === c.id);
      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        zip: a?.zip ?? null,
        address: a ? `${a.line1}, ${a.city}` : null,
        rates: Object.fromEntries(rateRows.filter((r) => r.userId === c.id).map((r) => [r.serviceTypeId, r.rateCents])),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold text-ink">Schedule a clean</h2>
        <p className="text-slate">One visit or a recurring clean. Templates fill in the details.</p>
      </div>
      <ScheduleCleanForm
        clients={clients}
        services={services.map((s) => ({ id: s.id, name: s.name, defaultDurationMinutes: s.defaultDurationMinutes }))}
        crews={crewRows.map((c) => ({ id: c.id, name: c.name }))}
        templates={templates.map((t) => ({ ...t }))}
        defaultDate={addDays(businessTodayISO(), 1)}
        initialClientId={searchParams.client}
      />
    </div>
  );
}
