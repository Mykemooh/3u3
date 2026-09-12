import { getTenant, getServiceTypes, SERVICE_LABELS } from '@/lib/data';
import ServiceSettingsForm from '@/components/ServiceSettingsForm';

export default async function AdminServices() {
  const tenant = await getTenant();
  if (!tenant) return null;
  const services = await getServiceTypes(tenant.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-1 text-2xl font-bold text-ink">Services</h1>
        <p className="text-ink/60">
          Duration and recurring eligibility per service — these settings drive the scheduling engine (PRD 6.4).
        </p>
      </div>

      <div className="space-y-4">
        {services.map((s) => (
          <div key={s.id} className="card">
            <h2 className="mb-4 font-semibold text-ink">{SERVICE_LABELS[s.key] ?? s.name}</h2>
            <ServiceSettingsForm
              serviceId={s.id}
              initial={{ defaultDurationMinutes: s.defaultDurationMinutes, recurringEligible: s.recurringEligible }}
            />
          </div>
        ))}
        {services.length === 0 && <div className="card text-center text-ink/40">No services configured yet.</div>}
      </div>
    </div>
  );
}
