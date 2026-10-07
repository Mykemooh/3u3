import { getTenant, getServiceTypes } from '@/lib/data';
import { quotingForTenant } from '@/lib/quoting';
import QuotingSettingsForm from '@/components/admin/QuotingSettingsForm';

export const dynamic = 'force-dynamic';

/** Settings → Quoting: the ways this company prices a clean (lib/quoting.ts). */
export default async function QuotingSettingsPage() {
  const tenant = await getTenant();
  if (!tenant) return null;
  const services = await getServiceTypes(tenant.id);
  // Only services the company actually offers (Admin → Services) bring their options up.
  const keys = new Set(services.filter((s) => s.offered).map((s) => s.key));
  const { config, saved } = quotingForTenant(tenant);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">How you quote</h1>
        <p className="mt-1 text-slate">
          Choose how you price a clean. Estimates then work the price out from a home's details, and you can still change any line before it goes to the client.
        </p>
      </div>
      <QuotingSettingsForm
        initial={config}
        saved={saved}
        offers={{
          deep: keys.has('DEEP') || keys.has('MOVE_IN_OUT'),
          postConstruction: keys.has('POST_CONSTRUCTION'),
          commercial: keys.has('COMMERCIAL'),
        }}
      />
    </div>
  );
}
