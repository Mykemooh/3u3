'use client';

import { createContext, useContext, useMemo, useState } from 'react';

// Where role changes are sent: a company's own roles, or (Platform → Role template) the template new companies copy.
const ApiBase = createContext('/api/admin/roles');
import { useRouter } from 'next/navigation';

type Perm = { key: string; label: string; detail: string };
type RoleRow = {
  id: string;
  name: string;
  baseRole: 'ADMIN' | 'CLEANER' | 'CUSTOMER';
  staffRole: 'TEAM_LEAD' | 'CLEANER' | 'JR_CLEANER' | null;
  defaultKey: string | null;
  permissions: string[];
  memberCount: number;
  deletable: boolean;
};
type Person = { id: string; name: string; baseRole: 'ADMIN' | 'CLEANER'; roleId: string | null };
type Preset = { key: string; name: string; baseRole: 'ADMIN' | 'CLEANER'; staffRole: 'TEAM_LEAD' | 'CLEANER' | 'JR_CLEANER' | null; permissions: string[] };

const WORKS_AS: Record<string, string> = {
  TEAM_LEAD: 'Leads the job (finishes it, sees the team)',
  CLEANER: 'Cleans and documents rooms',
  JR_CLEANER: 'Junior — documents rooms',
};

const TIERS: { base: RoleRow['baseRole']; title: string; note: string }[] = [
  { base: 'ADMIN', title: 'Office', note: 'Sign in to the Admin portal. Each role opens only the sections ticked.' },
  { base: 'CLEANER', title: 'Crew', note: 'Sign in to the crew portal on their phone.' },
  { base: 'CUSTOMER', title: 'Clients', note: 'Sign in to the client portal.' },
];

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? 'Something went wrong.');
  return data;
}

export default function RolesManager({
  roles,
  people,
  adminPermissions,
  crewPermissions,
  presets,
  apiBase = '/api/admin/roles',
}: {
  roles: RoleRow[];
  people: Person[];
  adminPermissions: Perm[];
  crewPermissions: Perm[];
  presets: Preset[];
  apiBase?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);

  const run = async (fn: () => Promise<unknown>) => {
    setError('');
    try {
      await fn();
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <ApiBase.Provider value={apiBase}>
    <div className="space-y-8">
      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {TIERS.map((tier) => {
        const tierRoles = roles.filter((r) => r.baseRole === tier.base);
        return (
          <section key={tier.base}>
            <div className="mb-3">
              <h3 className="font-semibold text-ink">{tier.title}</h3>
              <p className="text-sm text-muted">{tier.note}</p>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {tierRoles.map((role) => (
                <RoleCard
                  key={role.id}
                  role={role}
                  perms={role.baseRole === 'ADMIN' ? adminPermissions : role.baseRole === 'CLEANER' ? crewPermissions : []}
                  members={people.filter((p) => p.roleId === role.id)}
                  sameTierRoles={tierRoles}
                  run={run}
                />
              ))}
            </div>
          </section>
        );
      })}

      {adding ? (
        <AddRoleForm
          presets={presets}
          adminPermissions={adminPermissions}
          crewPermissions={crewPermissions}
          onCancel={() => setAdding(false)}
          onCreate={(body) => run(async () => {
            await send(apiBase, 'POST', body);
            setAdding(false);
          })}
        />
      ) : (
        <button className="btn-primary" onClick={() => setAdding(true)}>Add a role</button>
      )}
    </div>
    </ApiBase.Provider>
  );
}

function RoleCard({
  role,
  perms,
  members,
  sameTierRoles,
  run,
}: {
  role: RoleRow;
  perms: Perm[];
  members: Person[];
  sameTierRoles: RoleRow[];
  run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const base = useContext(ApiBase);
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(role.name);
  const [checked, setChecked] = useState<Set<string>>(new Set(role.permissions));
  const fullAccess = role.defaultKey === 'ADMIN';
  const dirty = useMemo(
    () => checked.size !== role.permissions.length || role.permissions.some((p) => !checked.has(p)),
    [checked, role.permissions],
  );

  return (
    <div className="rounded-2xl border border-line bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        {editingName ? (
          <form
            className="flex flex-1 gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                await send(`${base}/${role.id}`, 'PATCH', { name });
                setEditingName(false);
              });
            }}
          >
            <input className="input !py-2" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoFocus aria-label="Role name" />
            <button className="btn-primary btn-sm">Save</button>
            <button type="button" className="text-sm text-muted" onClick={() => { setName(role.name); setEditingName(false); }}>Cancel</button>
          </form>
        ) : (
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-display text-lg font-bold text-ink">{role.name}</h4>
              <button className="text-xs font-semibold text-bronze hover:underline" onClick={() => setEditingName(true)}>
                Rename
              </button>
            </div>
            <p className="text-xs text-muted">
              {role.memberCount} {role.memberCount === 1 ? 'person' : 'people'}
              {role.staffRole ? ` · ${WORKS_AS[role.staffRole]}` : ''}
              {role.defaultKey ? ' · built-in' : ''}
            </p>
          </div>
        )}
        {role.deletable && !editingName && (
          <button
            type="button"
            title={role.memberCount > 0 ? 'Move everyone off this role first' : `Delete ${role.name}`}
            aria-label={`Delete ${role.name}`}
            disabled={role.memberCount > 0}
            onClick={() => {
              if (confirm(`Delete the role "${role.name}"?`)) run(() => send(`${base}/${role.id}`, 'DELETE'));
            }}
            className="rounded-lg p-2 text-muted hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
            </svg>
          </button>
        )}
      </div>

      {fullAccess && <p className="mt-3 rounded-xl bg-surface px-3 py-2 text-sm text-slate">Full access to everything. At least one person always stays on this role.</p>}

      {!fullAccess && perms.length > 0 && (
        <div className="mt-4 space-y-2">
          {perms.map((p) => (
            <label key={p.key} className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={checked.has(p.key)}
                onChange={(e) => {
                  const next = new Set(checked);
                  if (e.target.checked) next.add(p.key);
                  else next.delete(p.key);
                  setChecked(next);
                }}
              />
              <span>
                <span className="font-semibold text-ink">{p.label}</span>
                <span className="block text-xs text-muted">{p.detail}</span>
              </span>
            </label>
          ))}
          {dirty && (
            <button
              className="btn-primary btn-sm mt-2"
              onClick={() => run(() => send(`${base}/${role.id}`, 'PATCH', { permissions: Array.from(checked) }))}
            >
              Save access
            </button>
          )}
        </div>
      )}

      {members.length > 0 && sameTierRoles.length > 1 && (
        <ul className="mt-4 divide-y divide-line border-t border-line pt-2">
          {members.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="text-ink">{m.name}</span>
              <select
                className="rounded-lg border border-line px-2 py-1 text-xs"
                value={role.id}
                aria-label={`Role for ${m.name}`}
                onChange={(e) => run(() => send(`${base}/assign`, 'POST', { userId: m.id, roleId: e.target.value }))}
              >
                {sameTierRoles.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AddRoleForm({
  presets,
  adminPermissions,
  crewPermissions,
  onCancel,
  onCreate,
}: {
  presets: Preset[];
  adminPermissions: Perm[];
  crewPermissions: Perm[];
  onCancel: () => void;
  onCreate: (body: { name: string; baseRole: 'ADMIN' | 'CLEANER'; staffRole: string | null; permissions: string[] }) => void;
}) {
  const [name, setName] = useState('');
  const [baseRole, setBaseRole] = useState<'ADMIN' | 'CLEANER'>('ADMIN');
  const [staffRole, setStaffRole] = useState<'TEAM_LEAD' | 'CLEANER' | 'JR_CLEANER'>('CLEANER');
  const [perms, setPerms] = useState<Set<string>>(new Set());
  const list = baseRole === 'ADMIN' ? adminPermissions : crewPermissions;

  const applyPreset = (key: string) => {
    const p = presets.find((x) => x.key === key);
    if (!p) return;
    setName(p.name);
    setBaseRole(p.baseRole);
    if (p.staffRole) setStaffRole(p.staffRole);
    setPerms(new Set(p.permissions));
  };

  return (
    <form
      className="rounded-2xl border border-gold bg-white p-5"
      onSubmit={(e) => {
        e.preventDefault();
        onCreate({ name, baseRole, staffRole: baseRole === 'CLEANER' ? staffRole : null, permissions: Array.from(perms) });
      }}
    >
      <h3 className="font-semibold text-ink">Add a role</h3>
      <div className="mt-3 flex flex-wrap gap-2">
        <span className="text-sm text-muted">Start from:</span>
        {presets.map((p) => (
          <button type="button" key={p.key} onClick={() => applyPreset(p.key)} className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-slate hover:border-gold">
            {p.name}
          </button>
        ))}
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="role-name">Name</label>
          <input id="role-name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required />
        </div>
        <div>
          <label className="label" htmlFor="role-type">Signs in to</label>
          <select id="role-type" className="input" value={baseRole} onChange={(e) => { setBaseRole(e.target.value as 'ADMIN' | 'CLEANER'); setPerms(new Set()); }}>
            <option value="ADMIN">The Admin portal (office)</option>
            <option value="CLEANER">The crew portal</option>
          </select>
        </div>
        {baseRole === 'CLEANER' && (
          <div className="sm:col-span-2">
            <label className="label" htmlFor="works-as">On a job they</label>
            <select id="works-as" className="input" value={staffRole} onChange={(e) => setStaffRole(e.target.value as typeof staffRole)}>
              {Object.entries(WORKS_AS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        )}
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {list.map((p) => (
          <label key={p.key} className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={perms.has(p.key)}
              onChange={(e) => {
                const next = new Set(perms);
                if (e.target.checked) next.add(p.key);
                else next.delete(p.key);
                setPerms(next);
              }}
            />
            <span>
              <span className="font-semibold text-ink">{p.label}</span>
              <span className="block text-xs text-muted">{p.detail}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="mt-5 flex gap-3">
        <button className="btn-primary btn-sm">Add role</button>
        <button type="button" className="btn-secondary btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
