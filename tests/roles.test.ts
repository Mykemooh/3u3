import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seeded, makeUser } from './helpers/fixtures';
import {
  ensureDefaultRoles, listRoles, createRole, updateRole, deleteRole, assignRole, getUserRole, RoleError,
} from '@/lib/roles';
import { permissionForPath } from '@/lib/permissions';
import { logChange, historyFor, diff } from '@/lib/audit';

test('every company gets the five default roles, once', async () => {
  const { tenant } = await seeded();
  const a = await ensureDefaultRoles(tenant.id);
  const b = await ensureDefaultRoles(tenant.id);
  assert.equal(a.length, 5);
  assert.equal(b.length, 5);
  assert.deepEqual(a.map((r) => r.defaultKey).sort(), ['ADMIN', 'CLEANER', 'CLIENT', 'JR_CLEANER', 'TEAM_LEAD']);
});

test('existing users resolve to the right default role', async () => {
  const { admin, lead, client } = await seeded();
  assert.equal((await getUserRole(admin.id)).role?.defaultKey, 'ADMIN');
  assert.equal((await getUserRole(lead.id)).role?.defaultKey, 'TEAM_LEAD');
  assert.equal((await getUserRole(client.id)).role?.defaultKey, 'CLIENT');
  assert.ok((await getUserRole(admin.id)).permissions.has('payroll.manage'));
});

test('roles can be renamed, and the default Admin keeps full access', async () => {
  const { tenant, admin } = await seeded();
  const adminRole = (await listRoles(tenant.id)).find((r) => r.defaultKey === 'ADMIN')!;
  await updateRole(tenant.id, adminRole.id, { name: 'Owner' });
  const after = await getUserRole(admin.id);
  assert.equal(after.role?.name, 'Owner');
  assert.ok(after.permissions.has('settings.manage'));
  await assert.rejects(updateRole(tenant.id, adminRole.id, { permissions: [] }), RoleError);
  await updateRole(tenant.id, adminRole.id, { name: 'Admin' });
});

test('duplicate role names are refused', async () => {
  const { tenant } = await seeded();
  await assert.rejects(createRole(tenant.id, { name: 'cleaner', baseRole: 'CLEANER', permissions: [] }), /already a role/);
});

test('a custom admin role limits what its people can open', async () => {
  const { tenant } = await seeded();
  const role = await createRole(tenant.id, { name: 'Office Manager', baseRole: 'ADMIN', permissions: ['schedule.manage', 'clients.manage', 'crew.pricing'] });
  assert.equal(role.permissions, 'clients.manage,schedule.manage');
  const office = await makeUser(tenant.id, 'ADMIN');
  await assignRole(tenant.id, office.id, role.id);
  const { permissions } = await getUserRole(office.id);
  assert.ok(permissions.has('schedule.manage'));
  assert.ok(!permissions.has('payroll.manage'));
  assert.equal(permissionForPath('/admin/payroll/abc'), 'payroll.manage');
  assert.equal(permissionForPath('/api/admin/clients/123/rates'), 'quotes.manage');
  assert.equal(permissionForPath('/api/admin/clients/123'), 'clients.manage');
  assert.equal(permissionForPath('/admin'), null);
});

test('roles with people on them cannot be deleted; empty custom ones can', async () => {
  const { tenant } = await seeded();
  const list = await listRoles(tenant.id);
  const lead = list.find((r) => r.defaultKey === 'TEAM_LEAD')!;
  assert.ok(lead.memberCount >= 1);
  await assert.rejects(deleteRole(tenant.id, lead.id), /Move the/);
  const client = list.find((r) => r.defaultKey === 'CLIENT')!;
  await assert.rejects(deleteRole(tenant.id, client.id), /can be renamed but not deleted/);
  const temp = await createRole(tenant.id, { name: 'Seasonal Helper', baseRole: 'CLEANER', staffRole: 'JR_CLEANER', permissions: [] });
  await deleteRole(tenant.id, temp.id);
  assert.ok(!(await listRoles(tenant.id)).some((r) => r.id === temp.id));
});

test('crew moved to a custom role takes its job role', async () => {
  const { tenant } = await seeded();
  const senior = await createRole(tenant.id, { name: 'Senior Cleaner', baseRole: 'CLEANER', staffRole: 'TEAM_LEAD', permissions: ['crew.pricing'] });
  const person = await makeUser(tenant.id, 'CLEANER');
  const { role } = await assignRole(tenant.id, person.id, senior.id);
  assert.equal(role.name, 'Senior Cleaner');
  const resolved = await getUserRole(person.id);
  assert.equal(resolved.role?.id, senior.id);
  assert.ok(resolved.permissions.has('crew.pricing'));
  const client = await makeUser(tenant.id, 'CUSTOMER');
  await assert.rejects(assignRole(tenant.id, client.id, senior.id), /Only crew/);
});

test('the last full-access admin cannot be moved off the Admin role', async () => {
  const { tenant, admin } = await seeded();
  const office = (await listRoles(tenant.id)).find((r) => r.name === 'Office Manager')!;
  await assert.rejects(assignRole(tenant.id, admin.id, office.id), /Someone has to stay/);
});

test('change history records who changed what', async () => {
  const { tenant, admin } = await seeded();
  const changes = diff({ priceCents: 12000, cadence: 'BIWEEKLY' }, { priceCents: 13000, cadence: 'BIWEEKLY' });
  assert.deepEqual(changes, [{ field: 'priceCents', from: 12000, to: 13000 }]);
  await logChange({ tenantId: tenant.id, actor: admin, entityType: 'booking', entityId: 'b-1', action: 'updated', summary: 'Price changed', changes });
  const rows = await historyFor(tenant.id, 'booking', 'b-1');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].actorName, admin.name);
  assert.equal(rows[0].changes[0].to, 13000);
});
