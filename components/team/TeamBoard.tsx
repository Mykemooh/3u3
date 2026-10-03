'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { boardCollision } from '@/lib/dndCollision';
import CrewSettingsForm from '@/components/CrewSettingsForm';
import PhoneInput from '@/components/PhoneInput';

type StaffRole = 'TEAM_LEAD' | 'CLEANER' | 'JR_CLEANER';

export type BoardEmployee = { id: string; name: string; email: string | null; staffRole: StaffRole; crewId: string | null };
export type BoardTeam = {
  id: string;
  name: string;
  acceptsBookings: boolean;
  workStartMinutes: number;
  workEndMinutes: number;
  homesPerDay: number;
  commuteBufferMinutes: number;
  homeAddressLine1: string | null;
  homeCity: string | null;
  homeState: string | null;
  homeZip: string | null;
};

export const ROLE_LABELS: Record<StaffRole, string> = { TEAM_LEAD: 'Team Lead', CLEANER: 'Cleaner', JR_CLEANER: 'Jr. Cleaner' };
export const ROLE_STYLES: Record<StaffRole, string> = {
  TEAM_LEAD: 'bg-gold/15 text-bronze',
  CLEANER: 'bg-surface text-slate',
  JR_CLEANER: 'bg-emerald-50 text-green',
};

const NONE = 'none';

/**
 * The Team page: one column per team plus "Unassigned". Drag an employee
 * card to move them (one team each); change their role on the card. Saves
 * straight away, and puts the card back if the server refuses.
 */
export default function TeamBoard({ teams, employees: initial }: { teams: BoardTeam[]; employees: BoardEmployee[] }) {
  const router = useRouter();
  const [employees, setEmployees] = useState(initial);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const sensors = useSensors(
    // A small drag distance / touch delay, so tapping the role picker or a link isn't a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  );

  async function save(userId: string, patch: { crewId?: string | null; staffRole?: StaffRole }) {
    const before = employees;
    setError('');
    setEmployees((list) => list.map((e) => (e.id === userId ? { ...e, ...patch } : e)));
    const res = await fetch(`/api/admin/team/employees/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      setEmployees(before);
      setError((await res.json().catch(() => ({}))).error || 'Could not save that change.');
      return;
    }
    router.refresh();
  }

  function onDragEnd(e: DragEndEvent) {
    const userId = String(e.active.id);
    const target = e.over ? String(e.over.id) : null;
    if (!target) return;
    const crewId = target === NONE ? null : target;
    if (employees.find((x) => x.id === userId)?.crewId === crewId) return;
    save(userId, { crewId });
  }

  async function newTeam() {
    const name = window.prompt('Name for the new team (e.g. "Team B")');
    if (!name?.trim()) return;
    const res = await fetch('/api/admin/team/teams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error || 'Could not create the team.');
    router.refresh();
  }

  const nameOf = (id: unknown) => employees.find((x) => x.id === id)?.name ?? 'Employee';
  const columnName = (id: unknown) => (id === NONE ? 'Unassigned' : teams.find((t) => t.id === id)?.name ?? 'a team');
  const announcements = {
    onDragStart: ({ active }: any) => `Picked up ${nameOf(active.id)}.`,
    onDragOver: ({ active, over }: any) => (over ? `${nameOf(active.id)} is over ${columnName(over.id)}.` : `${nameOf(active.id)} is not over a team.`),
    onDragEnd: ({ active, over }: any) => (over ? `${nameOf(active.id)} moved to ${columnName(over.id)}.` : `${nameOf(active.id)} was not moved.`),
    onDragCancel: ({ active }: any) => `Cancelled. ${nameOf(active.id)} was not moved.`,
  };

  const columns: { id: string; team: BoardTeam | null }[] = [
    ...teams.map((t) => ({ id: t.id, team: t })),
    { id: NONE, team: null },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={newTeam} className="btn-secondary btn-sm">
          + New team
        </button>
        <button onClick={() => setAdding((v) => !v)} className="btn-primary btn-sm">
          {adding ? 'Close' : '+ Add employee'}
        </button>
        <p className="text-sm text-muted">Drag people between teams. Changes save as you go.</p>
      </div>

      {adding && <AddEmployeeForm teams={teams} onDone={() => { setAdding(false); router.refresh(); }} />}
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </p>
      )}

      <DndContext sensors={sensors} collisionDetection={boardCollision} onDragEnd={onDragEnd} accessibility={{ announcements }}>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {columns.map(({ id, team }) => (
            <TeamColumn
              key={id}
              id={id}
              team={team}
              members={employees.filter((e) => (e.crewId ?? NONE) === id)}
              onRole={(userId, staffRole) => save(userId, { staffRole })}
              onError={setError}
            />
          ))}
        </div>
      </DndContext>
    </div>
  );
}

function TeamColumn({
  id,
  team,
  members,
  onRole,
  onError,
}: {
  id: string;
  team: BoardTeam | null;
  members: BoardEmployee[];
  onRole: (userId: string, role: StaffRole) => void;
  onError: (msg: string) => void;
}) {
  const router = useRouter();
  const { setNodeRef, isOver } = useDroppable({ id });
  const [showHours, setShowHours] = useState(false);
  const [accepts, setAccepts] = useState(team?.acceptsBookings ?? false);
  const hasLead = members.some((m) => m.staffRole === 'TEAM_LEAD');

  async function patchTeam(patch: { name?: string; acceptsBookings?: boolean }) {
    if (!team) return;
    const res = await fetch(`/api/admin/team/teams/${team.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      onError((await res.json().catch(() => ({}))).error || 'Could not update the team.');
      if (patch.acceptsBookings !== undefined) setAccepts(!patch.acceptsBookings);
      return;
    }
    router.refresh();
  }

  function rename() {
    const name = window.prompt('Team name', team?.name);
    if (name?.trim() && name !== team?.name) patchTeam({ name: name.trim() });
  }

  return (
    <section
      ref={setNodeRef}
      className={`flex min-h-[220px] flex-col rounded-2xl border p-4 transition ${
        isOver ? 'border-gold bg-gold/5' : team ? 'border-line bg-white' : 'border-dashed border-line bg-surface'
      }`}
      aria-label={team ? team.name : 'Unassigned'}
    >
      <header className="mb-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-ink">
            {team ? team.name : 'Unassigned'}{' '}
            <span className="text-sm font-semibold text-muted">· {members.length}</span>
          </h2>
          {team && (
            <button onClick={rename} className="text-xs font-semibold text-muted hover:text-ink">
              Rename
            </button>
          )}
        </div>
        {team && (
          <>
            <label className="mt-2 flex items-center gap-2 text-sm text-slate">
              <input
                type="checkbox"
                checked={accepts}
                onChange={(e) => {
                  setAccepts(e.target.checked);
                  patchTeam({ acceptsBookings: e.target.checked });
                }}
              />
              Takes online bookings
            </label>
            {!hasLead && members.length > 0 && (
              <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                No Team Lead — anyone on this team's jobs can start and finish them.
              </p>
            )}
          </>
        )}
        {!team && <p className="mt-1 text-xs text-muted">Not on a team: they only see jobs they're added to one by one.</p>}
      </header>

      <ul className="flex-1 space-y-2">
        {members.map((m) => (
          <EmployeeCard key={m.id} employee={m} onRole={onRole} />
        ))}
        {members.length === 0 && <li className="py-6 text-center text-sm text-muted">Drag people here</li>}
      </ul>

      {team && (
        <div className="mt-3 border-t border-line pt-3">
          <button onClick={() => setShowHours((v) => !v)} className="text-sm font-semibold text-bronze">
            {showHours ? 'Hide hours & capacity' : 'Hours & capacity'}
          </button>
          {showHours && (
            <div className="mt-3">
              <CrewSettingsForm
                crewId={team.id}
                initial={{
                  workStartMinutes: team.workStartMinutes,
                  workEndMinutes: team.workEndMinutes,
                  homesPerDay: team.homesPerDay,
                  commuteBufferMinutes: team.commuteBufferMinutes,
                  homeAddressLine1: team.homeAddressLine1,
                  homeCity: team.homeCity,
                  homeState: team.homeState,
                  homeZip: team.homeZip,
                }}
              />
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function EmployeeCard({ employee, onRole }: { employee: BoardEmployee; onRole: (userId: string, role: StaffRole) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: employee.id });
  return (
    <li
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined}
      className={`flex cursor-grab touch-none items-center justify-between gap-3 rounded-xl border border-line bg-white px-3 py-2.5 shadow-sm active:cursor-grabbing ${
        isDragging ? 'relative z-50 shadow-card-lg' : ''
      }`}
      aria-roledescription="Draggable employee"
    >
      <div className="min-w-0">
        <p className="truncate font-semibold text-ink">{employee.name}</p>
        <Link href={`/admin/team/${employee.id}`} className="text-xs font-semibold text-bronze hover:underline">
          Schedule →
        </Link>
      </div>
      <select
        value={employee.staffRole}
        onChange={(e) => onRole(employee.id, e.target.value as StaffRole)}
        // Keep the select usable: don't let pressing on it start a drag.
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        className={`rounded-lg border-0 px-2 py-1 text-xs font-semibold ${ROLE_STYLES[employee.staffRole]}`}
        aria-label={`Role for ${employee.name}`}
      >
        {(Object.keys(ROLE_LABELS) as StaffRole[]).map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </select>
    </li>
  );
}

const PAY_TYPE_OPTIONS: { value: 'HOURLY' | 'PER_CLEAN' | 'DAY_RATE'; label: string; rateLabel: string }[] = [
  { value: 'HOURLY', label: 'Hourly (clock in/out)', rateLabel: 'Rate per hour' },
  { value: 'PER_CLEAN', label: 'Per clean (flat rate per job)', rateLabel: 'Rate per clean' },
  { value: 'DAY_RATE', label: 'Full workday (flat daily rate)', rateLabel: 'Rate per day' },
];

function AddEmployeeForm({ teams, onDone }: { teams: BoardTeam[]; onDone: () => void }) {
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    staffRole: 'CLEANER' as StaffRole,
    crewId: teams[0]?.id ?? '',
    payType: 'HOURLY' as 'HOURLY' | 'PER_CLEAN' | 'DAY_RATE',
    payRate: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const rate = form.payRate ? Number(form.payRate) : null;
    const res = await fetch('/api/admin/team/employees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        email: form.email,
        phone: form.phone || undefined,
        staffRole: form.staffRole,
        crewId: form.crewId || null,
        payType: form.payType,
        payRatePerHour: form.payType === 'HOURLY' ? rate : null,
        payRatePerClean: form.payType === 'PER_CLEAN' ? rate : null,
        payRatePerDay: form.payType === 'DAY_RATE' ? rate : null,
      }),
    });
    setBusy(false);
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error || 'Could not add them.');
    onDone();
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const payTypeMeta = PAY_TYPE_OPTIONS.find((o) => o.value === form.payType)!;

  return (
    <form onSubmit={submit} className="card grid gap-4 sm:grid-cols-2">
      <div>
        <label className="label">Name</label>
        <input className="input" value={form.name} onChange={set('name')} required />
      </div>
      <div>
        <label className="label">Email (they sign in with this)</label>
        <input className="input" type="email" value={form.email} onChange={set('email')} required />
      </div>
      <div>
        <label className="label">Phone (optional)</label>
        <PhoneInput value={form.phone} onChange={(phone) => setForm((f) => ({ ...f, phone }))} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Role</label>
          <select className="input" value={form.staffRole} onChange={set('staffRole')}>
            {(Object.keys(ROLE_LABELS) as StaffRole[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Team</label>
          <select className="input" value={form.crewId} onChange={set('crewId')}>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
            <option value="">Unassigned</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Pay type</label>
          <select className="input" value={form.payType} onChange={set('payType')}>
            {PAY_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">{payTypeMeta.rateLabel} (optional)</label>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate">$</span>
            <input className="input pl-6" type="number" min={0} step={0.01} value={form.payRate} onChange={set('payRate')} placeholder="0.00" />
          </div>
        </div>
      </div>
      {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
      <div className="sm:col-span-2">
        <button type="submit" disabled={busy} className="btn-primary">
          {busy ? 'Adding…' : 'Add and email them a sign-in link'}
        </button>
      </div>
    </form>
  );
}
