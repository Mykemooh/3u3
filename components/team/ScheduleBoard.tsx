'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
import { ROLE_LABELS, ROLE_STYLES } from '@/components/team/TeamBoard';

type StaffRole = 'TEAM_LEAD' | 'CLEANER' | 'JR_CLEANER';

export type BoardCard = {
  bookingId: string;
  jobId?: string;
  jobStatus?: 'PENDING' | 'EN_ROUTE' | 'IN_PROGRESS' | 'COMPLETE';
  bookingStatus: 'REQUESTED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';
  clientId: string;
  clientName: string;
  serviceName: string;
  slotStart: string;
  slotEnd: string;
  crewId: string | null;
  addressLine?: string;
  isQuoteVisit: boolean;
  /** User ids working this job (team, with per-job swaps). */
  staff: string[];
};
export type BoardPerson = { id: string; name: string; staffRole: StaffRole; crewId: string | null };

const NONE = 'none';
const STATUS_STYLE: Record<string, string> = {
  PENDING: 'bg-surface text-muted',
  EN_ROUTE: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-amber-100 text-amber-700',
  COMPLETE: 'bg-emerald-100 text-emerald-700',
};
const STATUS_LABEL: Record<string, string> = { PENDING: 'Booked', EN_ROUTE: 'On the way', IN_PROGRESS: 'Cleaning', COMPLETE: 'Done' };

const hhmm = (iso: string) => iso.split('T')[1].slice(0, 5);
function timeLabel(iso: string) {
  const [h, m] = hhmm(iso).split(':').map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${m ? `:${String(m).padStart(2, '0')}` : ''}${h >= 12 ? 'p' : 'a'}`;
}
function dayLabel(dateISO: string) {
  const [y, m, d] = dateISO.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
}
function initials(name: string) {
  return name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}
/** Only jobs that haven't started can move — the same rule the server enforces. */
const movable = (c: BoardCard) =>
  !c.isQuoteVisit && c.bookingStatus !== 'COMPLETED' && c.bookingStatus !== 'CANCELLED' && (!c.jobStatus || c.jobStatus === 'PENDING');

/**
 * The dispatch board: teams down the side, the week across. Drag a job
 * card to another team or day; tap it to change the time or who's working
 * it. The server re-checks every move against double-booking, and the
 * card snaps back if it's refused.
 */
export default function ScheduleBoard({
  dates,
  today,
  teams,
  cards: initial,
  people,
}: {
  dates: string[];
  today: string;
  teams: { id: string; name: string }[];
  cards: BoardCard[];
  people: BoardPerson[];
}) {
  const router = useRouter();
  const [cards, setCards] = useState(initial);
  const [notify, setNotify] = useState(true);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [editing, setEditing] = useState<BoardCard | null>(null);
  // The click that ends a drag shouldn't also open the edit panel.
  const lastDragEnd = useRef(0);
  useEffect(() => setCards(initial), [initial]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  );
  const personById = useMemo(() => Object.fromEntries(people.map((p) => [p.id, p])), [people]);

  async function move(card: BoardCard, patch: { crewId?: string; date?: string; startTime?: string; endTime?: string }) {
    const before = cards;
    const date = patch.date ?? card.slotStart.split('T')[0];
    const start = `${date}T${patch.startTime ?? hhmm(card.slotStart)}:00`;
    const end = `${date}T${patch.endTime ?? hhmm(card.slotEnd)}:00`;
    setMessage(null);
    setCards((all) =>
      all.map((c) => (c.bookingId === card.bookingId ? { ...c, crewId: patch.crewId ?? c.crewId, slotStart: start, slotEnd: end } : c)),
    );
    const res = await fetch(`/api/admin/bookings/${card.bookingId}/schedule`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...patch, notify }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setCards(before);
      setMessage({ tone: 'error', text: data.error || 'Could not move that job.' });
      return false;
    }
    setMessage({ tone: 'ok', text: data.clientNotified ? `Moved — ${card.clientName} has been emailed the new time.` : 'Moved.' });
    router.refresh();
    return true;
  }

  function onDragEnd(e: DragEndEvent) {
    lastDragEnd.current = Date.now();
    if (!e.over) return;
    const card = cards.find((c) => c.bookingId === e.active.id);
    const [, crewId, date] = String(e.over.id).split('|');
    if (!card || crewId === NONE) return;
    const patch: { crewId?: string; date?: string } = {};
    if (crewId !== card.crewId) patch.crewId = crewId;
    if (!card.slotStart.startsWith(date)) patch.date = date;
    if (patch.crewId || patch.date) move(card, patch);
  }

  const cardName = (id: unknown) => {
    const c = cards.find((x) => x.bookingId === id);
    return c ? `${c.clientName}'s ${timeLabel(c.slotStart)} job` : 'Job';
  };
  const cellName = (id: unknown) => {
    const [, crewId, date] = String(id).split('|');
    return `${teams.find((t) => t.id === crewId)?.name ?? 'Needs a team'}, ${dayLabel(date ?? '')}`;
  };
  const announcements = {
    onDragStart: ({ active }: any) => `Picked up ${cardName(active.id)}.`,
    onDragOver: ({ active, over }: any) => (over ? `${cardName(active.id)} is over ${cellName(over.id)}.` : `${cardName(active.id)} is not over a day.`),
    onDragEnd: ({ active, over }: any) => (over ? `${cardName(active.id)} dropped on ${cellName(over.id)}.` : `${cardName(active.id)} was not moved.`),
    onDragCancel: ({ active }: any) => `Cancelled. ${cardName(active.id)} was not moved.`,
  };

  const rows: { id: string; name: string }[] = [...teams];
  const unassigned = cards.filter((c) => !c.isQuoteVisit && !c.crewId);
  if (unassigned.length) rows.push({ id: NONE, name: 'Needs a team' });

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-slate">
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
          Email clients when their day or time changes
        </label>
        <p className="text-sm text-muted">Drag a job to move it · tap it to edit time or crew</p>
      </div>
      {message && (
        <p
          role={message.tone === 'error' ? 'alert' : 'status'}
          className={`mb-3 rounded-xl px-4 py-3 text-sm font-medium ${message.tone === 'error' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-green'}`}
        >
          {message.text}
        </p>
      )}

      <DndContext sensors={sensors} collisionDetection={boardCollision} onDragEnd={onDragEnd} onDragCancel={() => (lastDragEnd.current = Date.now())}
        accessibility={{ announcements }}
      >
        <div className="overflow-x-auto">
          <div className="min-w-[980px]">
            <div className="grid grid-cols-[130px_repeat(7,1fr)] gap-2">
              <div />
              {dates.map((date) => (
                <div
                  key={date}
                  className={`rounded-lg px-2 py-1.5 text-center text-sm font-semibold ${date === today ? 'bg-gold/20 text-bronze' : 'text-slate'}`}
                >
                  {dayLabel(date)}
                </div>
              ))}

              {rows.map((row) => (
                <div key={row.id} className="contents">
                  <div className={`flex flex-col justify-center pr-2 text-sm font-semibold ${row.id === NONE ? 'text-amber-700' : 'text-ink'}`}>
                    {row.name}
                    {row.id !== NONE && (
                      <span className="mt-1 flex flex-wrap gap-1">
                        {people
                          .filter((p) => p.crewId === row.id)
                          .map((p) => (
                            <span key={p.id} title={`${p.name} · ${ROLE_LABELS[p.staffRole]}`} className={`pill !px-1.5 !py-0 text-[10px] ${ROLE_STYLES[p.staffRole]}`}>
                              {initials(p.name)}
                            </span>
                          ))}
                      </span>
                    )}
                  </div>
                  {dates.map((date) => (
                    <Cell key={date} id={`cell|${row.id}|${date}`} today={date === today} warn={row.id === NONE} disabled={row.id === NONE}>
                      {cards
                        .filter((c) => !c.isQuoteVisit && (c.crewId ?? NONE) === row.id && c.slotStart.startsWith(date))
                        .sort((a, b) => a.slotStart.localeCompare(b.slotStart))
                        .map((c) => (
                          <JobCard
                            key={c.bookingId}
                            card={c}
                            personById={personById}
                            onOpen={() => Date.now() - lastDragEnd.current > 300 && setEditing(c)}
                          />
                        ))}
                    </Cell>
                  ))}
                </div>
              ))}

              <div className="contents">
                <div className="flex items-center pr-2 text-sm font-semibold text-muted">Quote visits</div>
                {dates.map((date) => (
                  <div key={date} className={`min-h-[60px] space-y-2 rounded-xl border border-dashed border-line p-1.5 ${date === today ? 'bg-gold/5' : ''}`}>
                    {cards
                      .filter((c) => c.isQuoteVisit && c.slotStart.startsWith(date))
                      .map((c) => (
                        <Link key={c.bookingId} href="/admin/leads" className="block rounded-xl border border-line bg-white p-2 text-xs hover:border-gold">
                          <span className="font-semibold text-ink">{timeLabel(c.slotStart)}</span>
                          <p className="font-medium text-ink">{c.clientName}</p>
                          {c.addressLine && <p className="truncate text-muted">{c.addressLine}</p>}
                        </Link>
                      ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </DndContext>

      {editing && (
        <JobPanel
          card={editing}
          teams={teams}
          people={people}
          notify={notify}
          onClose={() => setEditing(null)}
          onMove={move}
          onSaved={(text) => {
            setEditing(null);
            setMessage({ tone: 'ok', text });
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function Cell({ id, today, warn, disabled, children }: { id: string; today: boolean; warn: boolean; disabled: boolean; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled });
  return (
    <div
      ref={setNodeRef}
      className={`min-h-[96px] space-y-2 rounded-xl border p-1.5 transition ${
        isOver ? 'border-gold bg-gold/10' : warn ? 'border-amber-200 bg-amber-50/60' : today ? 'border-line bg-gold/5' : 'border-line bg-surface'
      }`}
    >
      {children}
    </div>
  );
}

function JobCard({ card, personById, onOpen }: { card: BoardCard; personById: Record<string, BoardPerson>; onOpen: () => void }) {
  const canMove = movable(card);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: card.bookingId, disabled: !canMove });
  const staff = card.staff.map((id) => personById[id]).filter(Boolean);
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onOpen}
      style={transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined}
      className={`rounded-xl border border-line bg-white p-2 text-left text-xs shadow-sm ${canMove ? 'cursor-grab touch-none active:cursor-grabbing' : 'cursor-pointer'} ${
        isDragging ? 'relative z-50 shadow-card-lg' : 'hover:border-gold'
      }`}
      aria-roledescription={canMove ? 'Draggable job' : 'Job'}
      aria-label={`${card.clientName}, ${timeLabel(card.slotStart)} to ${timeLabel(card.slotEnd)}`}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="font-semibold text-ink">
          {timeLabel(card.slotStart)}–{timeLabel(card.slotEnd)}
        </span>
        {card.jobStatus && card.jobStatus !== 'PENDING' && (
          <span className={`pill ${STATUS_STYLE[card.jobStatus]} !px-1.5 !py-0 text-[10px]`}>{STATUS_LABEL[card.jobStatus]}</span>
        )}
      </div>
      <p className="mt-0.5 truncate font-medium text-ink">{card.clientName}</p>
      <p className="truncate text-muted">{card.serviceName}</p>
      {card.addressLine && <p className="truncate text-muted">{card.addressLine}</p>}
      {staff.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {staff.map((p) => (
            <span key={p.id} title={`${p.name} · ${ROLE_LABELS[p.staffRole]}`} className={`pill !px-1.5 !py-0 text-[10px] ${ROLE_STYLES[p.staffRole]}`}>
              {initials(p.name)}
            </span>
          ))}
        </div>
      )}
      {card.jobId && staff.length === 0 && <p className="mt-1 text-[10px] font-semibold text-amber-700">Nobody on this job</p>}
    </div>
  );
}

function JobPanel({
  card,
  teams,
  people,
  notify,
  onClose,
  onMove,
  onSaved,
}: {
  card: BoardCard;
  teams: { id: string; name: string }[];
  people: BoardPerson[];
  notify: boolean;
  onClose: () => void;
  onMove: (card: BoardCard, patch: { crewId?: string; date?: string; startTime?: string; endTime?: string }) => Promise<boolean>;
  onSaved: (text: string) => void;
}) {
  const canMove = movable(card);
  const [date, setDate] = useState(card.slotStart.split('T')[0]);
  const [start, setStart] = useState(hhmm(card.slotStart));
  const [end, setEnd] = useState(hhmm(card.slotEnd));
  const [crewId, setCrewId] = useState(card.crewId ?? teams[0]?.id ?? '');
  const [staff, setStaff] = useState<Set<string>>(new Set(card.staff));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function changeTeam(next: string) {
    setCrewId(next);
    // A new team brings its own people; per-job swaps start over.
    setStaff(new Set(people.filter((p) => p.crewId === next).map((p) => p.id)));
  }

  const toggle = (id: string) =>
    setStaff((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  async function save() {
    setBusy(true);
    setError('');
    const patch: { crewId?: string; date?: string; startTime?: string; endTime?: string } = {};
    if (crewId && crewId !== card.crewId) patch.crewId = crewId;
    if (date !== card.slotStart.split('T')[0]) patch.date = date;
    if (start !== hhmm(card.slotStart)) patch.startTime = start;
    if (end !== hhmm(card.slotEnd)) patch.endTime = end;
    const moved = Object.keys(patch).length > 0;
    if (moved && !(await onMove(card, patch))) {
      setBusy(false);
      setError('That change was refused — see the message above the board.');
      return;
    }
    const before = new Set(card.staff);
    const staffChanged = patch.crewId !== undefined || before.size !== staff.size || [...staff].some((id) => !before.has(id));
    if (card.jobId && staffChanged) {
      const res = await fetch(`/api/admin/jobs/${card.jobId}/staff`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: [...staff] }),
      });
      if (!res.ok) {
        setBusy(false);
        setError((await res.json().catch(() => ({}))).error || 'Could not update who’s on this job.');
        return;
      }
    }
    setBusy(false);
    onSaved(moved || staffChanged ? 'Job updated.' : 'No changes.');
  }

  const teamPeople = people.filter((p) => p.crewId === crewId);
  const others = people.filter((p) => p.crewId !== crewId);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Edit ${card.clientName}'s job`}
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-6 shadow-card-lg sm:max-w-lg sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="eyebrow">{card.serviceName}</p>
            <h2 className="text-xl font-bold text-ink">{card.clientName}</h2>
            {card.addressLine && <p className="text-sm text-slate">{card.addressLine}</p>}
          </div>
          <button onClick={onClose} className="text-2xl leading-none text-muted hover:text-ink" aria-label="Close">
            ×
          </button>
        </div>

        {!canMove && (
          <p className="mb-4 rounded-xl bg-cream px-4 py-3 text-sm text-bronze">
            This job has {card.jobStatus === 'COMPLETE' ? 'finished' : 'started'}, so its time and team are fixed.
            {card.jobStatus !== 'COMPLETE' && ' You can still change who’s on it.'}
          </p>
        )}

        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-3 sm:col-span-1">
            <label className="label" htmlFor="jp-date">
              Date
            </label>
            <input id="jp-date" type="date" className="input" value={date} disabled={!canMove} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="jp-start">
              Start
            </label>
            <input id="jp-start" type="time" step={300} className="input" value={start} disabled={!canMove} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="jp-end">
              End
            </label>
            <input id="jp-end" type="time" step={300} className="input" value={end} disabled={!canMove} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>

        <div className="mt-4">
          <label className="label" htmlFor="jp-team">
            Team
          </label>
          <select id="jp-team" className="input" value={crewId} disabled={!canMove} onChange={(e) => changeTeam(e.target.value)}>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        {card.jobId && card.jobStatus !== 'COMPLETE' && (
          <fieldset className="mt-5">
            <legend className="label">Who's on this job</legend>
            <PeopleList title="On this team" people={teamPeople} staff={staff} toggle={toggle} />
            {others.length > 0 && <PeopleList title="Borrow from elsewhere" people={others} staff={staff} toggle={toggle} />}
          </fieldset>
        )}

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button onClick={save} disabled={busy} className="btn-primary">
            {busy ? 'Saving…' : 'Save changes'}
          </button>
          {card.jobId && (
            <Link href={`/crew/jobs/${card.jobId}`} className="btn-secondary btn-sm">
              Open job
            </Link>
          )}
          <span className="text-xs text-muted">{notify ? 'Client is emailed if the day or time changes.' : 'Client won’t be emailed.'}</span>
        </div>
      </div>
    </div>
  );
}

function PeopleList({ title, people, staff, toggle }: { title: string; people: BoardPerson[]; staff: Set<string>; toggle: (id: string) => void }) {
  return (
    <div className="mt-2">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{title}</p>
      {people.length === 0 && <p className="text-sm text-muted">Nobody yet.</p>}
      <ul className="space-y-1">
        {people.map((p) => (
          <li key={p.id}>
            <label className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-surface">
              <span className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={staff.has(p.id)} onChange={() => toggle(p.id)} />
                {p.name}
              </span>
              <span className={`pill !px-2 !py-0.5 text-[11px] ${ROLE_STYLES[p.staffRole]}`}>{ROLE_LABELS[p.staffRole]}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
