import { getTenant } from '@/lib/data';
import { listRoles, roleIdFor, ensureDefaultRoles, ROLE_PRESETS } from '@/lib/roles';
import { ADMIN_PERMISSIONS, CREW_PERMISSIONS } from '@/lib/permissions';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { and, eq, ne } from 'drizzle-orm';
import RolesManager from '@/components/admin/RolesManager';

export const dynamic = 'force-dynamic';

export default async function RolesPage() {
  const tenant = await getTenant();
  if (!tenant) return null;
  const [roles, raw] = await Promise.all([
    listRoles(tenant.id),
    db.select().from(users).where(and(eq(users.tenantId, tenant.id), ne(users.role, 'CUSTOMER'), eq(users.isActive, true))),
  ]);
  const tenantRoles = await ensureDefaultRoles(tenant.id);
  const people = raw
    .filter((u) => u.role === 'ADMIN' || u.role === 'CLEANER')
    .map((u) => ({ id: u.id, name: u.name, baseRole: u.role as 'ADMIN' | 'CLEANER', roleId: roleIdFor(u, tenantRoles) }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold text-ink">Roles</h2>
        <p className="mt-1 max-w-2xl text-slate">
          Rename any role to match how your company talks, add your own with just the access they need, and delete the ones
          you don't use. Changes apply the next time each person opens a page.
        </p>
      </div>
      <RolesManager
        roles={roles.map((r) => ({
          id: r.id,
          name: r.name,
          baseRole: r.baseRole,
          staffRole: r.staffRole,
          defaultKey: r.defaultKey,
          permissions: r.permissionList,
          memberCount: r.memberCount,
          deletable: r.deletable,
        }))}
        people={people}
        adminPermissions={ADMIN_PERMISSIONS}
        crewPermissions={CREW_PERMISSIONS}
        presets={ROLE_PRESETS.map((p) => ({ ...p }))}
      />
    </div>
  );
}
