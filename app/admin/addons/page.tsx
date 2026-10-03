import { getTenant } from '@/lib/data';
import { getAddOnCatalog } from '@/lib/addons';
import AddOnCatalogRow from '@/components/admin/AddOnCatalogRow';
import AddOnCatalogCreateForm from '@/components/admin/AddOnCatalogCreateForm';

export default async function AdminAddOns() {
  const tenant = await getTenant();
  if (!tenant) return null;
  const addOns = await getAddOnCatalog(tenant.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-1 text-2xl font-bold text-ink">Add-on services</h1>
        <p className="text-slate">
          The optional extras clients can add to a booking — "Want to add a service for this clean?" on the
          booking wizard. Set a default price here; a specific client's price can be overridden on their profile.
        </p>
      </div>

      <div className="card">
        <h2 className="mb-4 font-semibold text-ink">Add a new service</h2>
        <AddOnCatalogCreateForm />
      </div>

      <div className="space-y-3">
        {addOns.map((a) => (
          <AddOnCatalogRow
            key={a.id}
            addOnId={a.id}
            initial={{ name: a.name, description: a.description, defaultPriceCents: a.defaultPriceCents, active: a.active }}
          />
        ))}
        {addOns.length === 0 && <div className="card text-center text-muted">No add-on services yet — create one above.</div>}
      </div>
    </div>
  );
}
