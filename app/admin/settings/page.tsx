import { getTenant } from '@/lib/data';
import { getPayrollSettings } from '@/lib/payroll';
import TenantSettingsForm from '@/components/admin/TenantSettingsForm';

export default async function AdminSettings() {
  const tenant = await getTenant();
  if (!tenant) return null;
  const settings = await getPayrollSettings(tenant.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-1 text-2xl font-bold text-ink">Settings</h1>
        <p className="text-slate">Payroll behaviors you control directly, rather than the app deciding for you.</p>
      </div>

      <div className="card max-w-2xl">
        <TenantSettingsForm initial={settings} />
      </div>
    </div>
  );
}
