import { listRoles, ROLE_PRESETS } from '@/lib/roles';
import { ADMIN_PERMISSIONS, CREW_PERMISSIONS } from '@/lib/permissions';
import { platformTenantId } from '@/lib/platformRoles';
import RolesManager from '@/components/admin/RolesManager';

export const dynamic = 'force-dynamic';

export default async function PlatformRolesPage() {
  const tenantId = await platformTenantId();
  if (!tenantId) return <p className="text-slate">No platform tenant yet.</p>;
  const roles = await listRoles(tenantId);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Role template</h1>
        <p className="mt-1 max-w-2xl text-slate">
          The roles every new company starts with. Rename the defaults (for example “Team Lead” to “Crew Chief”), change what each
          can do, or add roles. Companies that already exist keep their own copies and can change them in Team → Roles.
        </p>
      </div>
      <RolesManager
        apiBase="/api/platform/roles"
        roles={roles.map((r) => ({
          id: r.id,
          name: r.name,
          baseRole: r.baseRole,
          staffRole: r.staffRole,
          defaultKey: r.defaultKey,
          permissions: r.permissionList,
          memberCount: 0,
          deletable: r.deletable,
        }))}
        people={[]}
        adminPermissions={ADMIN_PERMISSIONS}
        crewPermissions={CREW_PERMISSIONS}
        presets={ROLE_PRESETS.map((p) => ({ ...p }))}
      />
    </div>
  );
}
