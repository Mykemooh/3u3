import { db } from '@/db/client';
import { roles, users, tenants } from '@/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import {
  ALL_ADMIN_PERMISSION_KEYS, parsePermissions, serializePermissions,
  type AdminPermission, type Permission,
} from '@/lib/permissions';

/**
 * Renameable roles. Every company starts with the five roles the app has
 * always had — Admin, Team Lead, Cleaner, Jr. Cleaner and Client — and can
 * rename any of them, add its own (an "Office Manager" with a narrower set
 * of permissions, say), or delete one nobody is assigned to.
 *
 * Nothing here changes how existing users sign in: users.role (the access
 * tier) and users.staffRole (lead/cleaner/junior on a job) stay the source
 * of truth for the rest of the app. A role only adds a name and, for admin
 * roles, a permission set. A user with no roleId simply has their tier's
 * default role.
 *
 * The roles kept under the TrashCan platform tenant are the template every
 * new company is provisioned with (copyRoleTemplate), so the platform owner
 * can rename the defaults for every future customer in one place.
 */

export type Role = typeof roles.$inferSelect;
export type DefaultRoleKey = 'ADMIN' | 'TEAM_LEAD' | 'CLEANER' | 'JR_CLEANER' | 'CLIENT';

export class RoleError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export const DEFAULT_ROLES: {
  defaultKey: DefaultRoleKey;
  name: string;
  baseRole: 'ADMIN' | 'CLEANER' | 'CUSTOMER';
  staffRole: 'TEAM_LEAD' | 'CLEANER' | 'JR_CLEANER' | null;
  permissions: Permission[];
}[] = [
  { defaultKey: 'ADMIN', name: 'Admin', baseRole: 'ADMIN', staffRole: null, permissions: ALL_ADMIN_PERMISSION_KEYS },
  { defaultKey: 'TEAM_LEAD', name: 'Team Lead', baseRole: 'CLEANER', staffRole: 'TEAM_LEAD', permissions: ['crew.team_schedule'] },
  { defaultKey: 'CLEANER', name: 'Cleaner', baseRole: 'CLEANER', staffRole: 'CLEANER', permissions: [] },
  { defaultKey: 'JR_CLEANER', name: 'Jr. Cleaner', baseRole: 'CLEANER', staffRole: 'JR_CLEANER', permissions: [] },
  { defaultKey: 'CLIENT', name: 'Client', baseRole: 'CUSTOMER', staffRole: null, permissions: [] },
];

/** Presets offered when adding a role — a starting point, editable after. */
export const ROLE_PRESETS: { key: string; name: string; baseRole: 'ADMIN' | 'CLEANER'; staffRole: 'TEAM_LEAD' | 'CLEANER' | 'JR_CLEANER' | null; permissions: Permission[] }[] = [
  {
    key: 'OFFICE_MANAGER',
    name: 'Office Manager',
    baseRole: 'ADMIN',
    staffRole: null,
    permissions: ['schedule.manage', 'clients.manage', 'quotes.manage', 'invoices.manage', 'reports.view', 'marketing.manage', 'messages.manage', 'expenses.manage', 'supplies.manage', 'help.manage'],
  },
  {
    key: 'DISPATCHER',
    name: 'Dispatcher',
    baseRole: 'ADMIN',
    staffRole: null,
    permissions: ['schedule.manage', 'clients.manage', 'messages.manage', 'supplies.manage'],
  },
  { key: 'SENIOR_CLEANER', name: 'Senior Cleaner', baseRole: 'CLEANER', staffRole: 'CLEANER', permissions: ['crew.pricing', 'crew.team_schedule'] },
];

/**
 * Make sure a company has its default roles. Idempotent; called lazily
 * wherever roles are read, so every existing company gets them the first
 * time anyone looks, with no backfill step. A company created from the
 * platform template gets the template's names instead of the built-ins.
 */
export async function ensureDefaultRoles(tenantId: string): Promise<Role[]> {
  const existing = await db.select().from(roles).where(eq(roles.tenantId, tenantId));
  const haveKeys = new Set(existing.map((r) => r.defaultKey).filter(Boolean));
  const missing = DEFAULT_ROLES.filter((d) => !haveKeys.has(d.defaultKey));
  if (missing.length === 0) return sortRoles(existing);

  const template = await platformTemplateRoles(tenantId);
  const takenNames = new Set(existing.map((r) => r.name.toLowerCase()));
  for (const def of missing) {
    const fromTemplate = template.find((t) => t.defaultKey === def.defaultKey);
    let name = fromTemplate?.name ?? def.name;
    if (takenNames.has(name.toLowerCase())) name = def.name;
    if (takenNames.has(name.toLowerCase())) continue;
    takenNames.add(name.toLowerCase());
    await db
      .insert(roles)
      .values({
        id: crypto.randomUUID(),
        tenantId,
        name,
        baseRole: def.baseRole,
        staffRole: def.staffRole,
        permissions: serializePermissions(fromTemplate ? parsePermissions(fromTemplate.permissions) : def.permissions),
        defaultKey: def.defaultKey,
        sortOrder: DEFAULT_ROLES.indexOf(def),
      })
      .onConflictDoNothing();
  }
  return sortRoles(await db.select().from(roles).where(eq(roles.tenantId, tenantId)));
}

async function platformTemplateRoles(tenantId: string): Promise<Role[]> {
  const platform = (await db.select().from(tenants).where(eq(tenants.isPlatform, true)).limit(1))[0];
  if (!platform || platform.id === tenantId) return [];
  return db.select().from(roles).where(eq(roles.tenantId, platform.id));
}

function sortRoles(rows: Role[]): Role[] {
  const tier = { ADMIN: 0, CLEANER: 1, CUSTOMER: 2 } as const;
  return [...rows].sort((a, b) => tier[a.baseRole] - tier[b.baseRole] || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export async function listRoles(tenantId: string) {
  const rows = await ensureDefaultRoles(tenantId);
  const members = await db
    .select({ id: users.id, role: users.role, staffRole: users.staffRole, roleId: users.roleId })
    .from(users)
    .where(eq(users.tenantId, tenantId));
  return rows.map((role) => ({
    ...role,
    permissionList: parsePermissions(role.permissions),
    memberCount: members.filter((m) => roleIdFor(m, rows) === role.id).length,
    deletable: role.defaultKey !== 'ADMIN' && role.defaultKey !== 'CLIENT',
  }));
}

/** Which role a user is on: their own roleId, else their tier's default. */
export function roleIdFor(
  user: { role: string; staffRole: string | null; roleId: string | null },
  tenantRoles: Role[],
): string | null {
  if (user.roleId && tenantRoles.some((r) => r.id === user.roleId)) return user.roleId;
  const key: DefaultRoleKey | null =
    user.role === 'ADMIN' ? 'ADMIN'
    : user.role === 'CUSTOMER' ? 'CLIENT'
    : user.role === 'CLEANER' ? ((user.staffRole as DefaultRoleKey | null) ?? 'CLEANER')
    : null;
  return tenantRoles.find((r) => r.defaultKey === key)?.id ?? null;
}

export async function getUserRole(userId: string): Promise<{ role: Role | null; permissions: Set<Permission> }> {
  const user = (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0];
  if (!user) return { role: null, permissions: new Set() };
  const tenantRoles = await ensureDefaultRoles(user.tenantId);
  const id = roleIdFor(user, tenantRoles);
  const role = tenantRoles.find((r) => r.id === id) ?? null;
  // The default Admin role is always everything, whatever its row says,
  // so an owner can never lock themselves out of their own company.
  const permissions = new Set<Permission>(
    role?.defaultKey === 'ADMIN' ? ALL_ADMIN_PERMISSION_KEYS : parsePermissions(role?.permissions),
  );
  return { role, permissions };
}

export async function hasPermission(userId: string, perm: Permission): Promise<boolean> {
  return (await getUserRole(userId)).permissions.has(perm);
}

function cleanName(name: string): string {
  const trimmed = name.replace(/\s+/g, ' ').trim();
  if (!trimmed) throw new RoleError('Give the role a name.');
  if (trimmed.length > 40) throw new RoleError('Keep role names under 40 characters.');
  return trimmed;
}

async function assertNameFree(tenantId: string, name: string, exceptId?: string) {
  const rows = await db.select().from(roles).where(eq(roles.tenantId, tenantId));
  if (rows.some((r) => r.id !== exceptId && r.name.toLowerCase() === name.toLowerCase())) {
    throw new RoleError(`There's already a role called "${name}".`);
  }
}

export async function createRole(
  tenantId: string,
  input: { name: string; baseRole: 'ADMIN' | 'CLEANER'; staffRole?: 'TEAM_LEAD' | 'CLEANER' | 'JR_CLEANER' | null; permissions: Permission[] },
): Promise<Role> {
  await ensureDefaultRoles(tenantId);
  const name = cleanName(input.name);
  await assertNameFree(tenantId, name);
  const id = crypto.randomUUID();
  await db.insert(roles).values({
    id,
    tenantId,
    name,
    baseRole: input.baseRole,
    staffRole: input.baseRole === 'CLEANER' ? input.staffRole ?? 'CLEANER' : null,
    permissions: serializePermissions(
      input.baseRole === 'ADMIN'
        ? input.permissions.filter((p) => !p.startsWith('crew.'))
        : input.permissions.filter((p) => p.startsWith('crew.')),
    ),
    sortOrder: 100,
  });
  return (await db.select().from(roles).where(eq(roles.id, id)).limit(1))[0]!;
}

export async function updateRole(
  tenantId: string,
  roleId: string,
  patch: { name?: string; permissions?: Permission[]; staffRole?: 'TEAM_LEAD' | 'CLEANER' | 'JR_CLEANER' },
): Promise<{ before: Role; after: Role }> {
  const before = (await db.select().from(roles).where(and(eq(roles.id, roleId), eq(roles.tenantId, tenantId))).limit(1))[0];
  if (!before) throw new RoleError('Role not found.', 404);
  const set: Partial<typeof roles.$inferInsert> = {};
  if (patch.name !== undefined) {
    const name = cleanName(patch.name);
    await assertNameFree(tenantId, name, roleId);
    set.name = name;
  }
  if (patch.permissions !== undefined) {
    if (before.defaultKey === 'ADMIN') throw new RoleError('The Admin role always has full access — rename it, or add a new role with fewer permissions.');
    if (before.baseRole === 'CUSTOMER') throw new RoleError('Client roles have no permissions to set.');
    set.permissions = serializePermissions(
      before.baseRole === 'ADMIN'
        ? patch.permissions.filter((p) => !p.startsWith('crew.'))
        : patch.permissions.filter((p) => p.startsWith('crew.')),
    );
  }
  if (patch.staffRole !== undefined) {
    if (before.baseRole !== 'CLEANER') throw new RoleError('Only crew roles have a job role.');
    if (before.defaultKey && before.defaultKey !== patch.staffRole) {
      throw new RoleError("A default crew role's job role is fixed — add a new role instead.");
    }
    set.staffRole = patch.staffRole;
  }
  if (Object.keys(set).length) await db.update(roles).set(set).where(eq(roles.id, roleId));
  // Keep every member's job role in step with the role they're on.
  if (set.staffRole) await db.update(users).set({ staffRole: set.staffRole }).where(eq(users.roleId, roleId));
  const after = (await db.select().from(roles).where(eq(roles.id, roleId)).limit(1))[0]!;
  return { before, after };
}

export async function deleteRole(tenantId: string, roleId: string): Promise<Role> {
  const list = await listRoles(tenantId);
  const role = list.find((r) => r.id === roleId);
  if (!role) throw new RoleError('Role not found.', 404);
  if (!role.deletable) throw new RoleError(`"${role.name}" can be renamed but not deleted — every company needs it.`);
  if (role.memberCount > 0) {
    throw new RoleError(`Move the ${role.memberCount} ${role.memberCount === 1 ? 'person' : 'people'} on "${role.name}" to another role first.`);
  }
  // Anyone pointing at it explicitly falls back to their tier's default.
  await db.update(users).set({ roleId: null }).where(eq(users.roleId, roleId));
  await db.delete(roles).where(eq(roles.id, roleId));
  return role;
}

/**
 * Put a person on a role. Crew can only move between crew roles and admins
 * between admin roles — moving someone between tiers (a cleaner becoming
 * an admin) changes how they sign in and is done deliberately elsewhere.
 * The last person on the default Admin role can't be moved off it.
 */
export async function assignRole(tenantId: string, userId: string, roleId: string) {
  const tenantRoles = await ensureDefaultRoles(tenantId);
  const role = tenantRoles.find((r) => r.id === roleId);
  if (!role) throw new RoleError('Role not found.', 404);
  const user = (await db.select().from(users).where(and(eq(users.id, userId), eq(users.tenantId, tenantId))).limit(1))[0];
  if (!user) throw new RoleError('Person not found.', 404);
  if (user.role !== role.baseRole) {
    throw new RoleError(
      role.baseRole === 'ADMIN' ? 'Only admins can be put on an admin role.' : role.baseRole === 'CLEANER' ? 'Only crew can be put on a crew role.' : 'Only clients can be put on a client role.',
    );
  }
  const current = roleIdFor(user, tenantRoles);
  const adminDefault = tenantRoles.find((r) => r.defaultKey === 'ADMIN');
  if (adminDefault && current === adminDefault.id && roleId !== adminDefault.id) {
    const admins = await db.select().from(users).where(and(eq(users.tenantId, tenantId), eq(users.role, 'ADMIN')));
    const onDefault = admins.filter((a) => roleIdFor(a, tenantRoles) === adminDefault.id && a.isActive);
    if (onDefault.length <= 1) throw new RoleError(`Someone has to stay on "${adminDefault.name}" — it's the role with full access.`);
  }
  await db
    .update(users)
    .set({ roleId: role.defaultKey ? null : role.id, ...(role.staffRole ? { staffRole: role.staffRole } : {}) })
    .where(eq(users.id, userId));
  return { user, role };
}

/** Role names for a list of users, for team lists and pickers. */
export async function roleNamesFor(tenantId: string, userIds: string[]): Promise<Record<string, string>> {
  if (userIds.length === 0) return {};
  const tenantRoles = await ensureDefaultRoles(tenantId);
  const rows = await db.select().from(users).where(inArray(users.id, userIds));
  const out: Record<string, string> = {};
  for (const u of rows) {
    const id = roleIdFor(u, tenantRoles);
    out[u.id] = tenantRoles.find((r) => r.id === id)?.name ?? '';
  }
  return out;
}

/** The display name of a default role — "Team Lead", or whatever it was renamed to. */
export async function defaultRoleName(tenantId: string, key: DefaultRoleKey): Promise<string> {
  const rows = await ensureDefaultRoles(tenantId);
  return rows.find((r) => r.defaultKey === key)?.name ?? DEFAULT_ROLES.find((d) => d.defaultKey === key)!.name;
}

/** Copies the platform's role template onto a brand-new company. */
export async function copyRoleTemplate(tenantId: string) {
  await ensureDefaultRoles(tenantId);
}

export type { AdminPermission, Permission };
