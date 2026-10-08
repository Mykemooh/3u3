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
import type { DayWeather, WeatherKind } from '@/lib/forecast';

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
  weather = {},
  weatherPlace = null,
}: {
  dates: string[];
  today: string;
  teams: { id: string; name: string }[];
  cards: BoardCard[];
  people: BoardPerson[];
  /** Day forecast keyed by date (lib/forecast.ts). */
  weather?: Record<string, DayWeather>;
  weatherPlace?: string | null;
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
  const weekend = (d: string) => {
    const [y, m, dd] = d.split('-').map(Number);
    const wd = new Date(y, m - 1, dd).getDay();
    return wd === 0 || wd === 6;
  };
  const colTone = (d: string) => (d === today ? 'bg-tc-lime-wash/60' : weekend(d) ? 'bg-tc-50' : 'bg-white');
  const hasForecast = Object.keys(weather).length > 0;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-tc-700">
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="accent-tc-black" />
          Email clients when their day or time changes
        </label>
        <p className="text-sm text-tc-500">Drag a job to move it · tap it to edit time or crew</p>
      </div>
      {message && (
        <p
          role={message.tone === 'error' ? 'alert' : 'status'}
          className={`mb-3 rounded-xl px-4 py-3 text-sm font-medium ${message.tone === 'error' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-800'}`}
        >
          {message.text}
        </p>
      )}

      <DndContext sensors={sensors} collisionDetection={boardCollision} onDragEnd={onDragEnd} onDragCancel={() => (lastDragEnd.current = Date.now())}
        accessibility={{ announcements }}
      >
        <div className="overflow-x-auto rounded-2xl border border-tc-200 bg-white shadow-tc-ring">
          <div className="min-w-[1040px]">
            <div className="grid grid-cols-[176px_repeat(7,minmax(0,1fr))]">
              {/* Header row: the day, its date, and the forecast */}
              <div className="flex items-end border-b border-tc-200 bg-tc-50 px-4 pb-3 pt-4">
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-tc-500">Team</span>
              </div>
              {dates.map((date) => (
                <DayHeader key={date} date={date} today={date === today} weekend={weekend(date)} weather={weather[date]} />
              ))}

              {rows.map((row) => {
                const members = people.filter((p) => p.crewId === row.id);
                const count = cards.filter((c) => !c.isQuoteVisit && (c.crewId ?? NONE) === row.id).length;
                return (
                  <div key={row.id} className="contents">
                    <div className={`flex flex-col justify-center gap-1.5 border-b border-tc-100 px-4 py-3 ${row.id === NONE ? 'bg-amber-50' : 'bg-white'}`}>
                      <span className={`text-[14px] font-semibold leading-tight ${row.id === NONE ? 'text-amber-800' : 'text-tc-900'}`}>{row.name}</span>
                      {row.id !== NONE && (
                        <span className="flex items-center gap-2">
                          <span className="flex -space-x-1">
                            {members.map((p) => (
                              <Avatar key={p.id} person={p} />
                            ))}
                          </span>
                          <span className="text-[12px] text-tc-500">
                            {count} {count === 1 ? 'job' : 'jobs'}
                          </span>
                        </span>
                      )}
                    </div>
                    {dates.map((date) => (
                      <Cell key={date} id={`cell|${row.id}|${date}`} tone={colTone(date)} warn={row.id === NONE} disabled={row.id === NONE}>
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
                );
              })}

              <div className="contents">
                <div className="flex flex-col justify-center gap-0.5 bg-tc-50 px-4 py-3">
                  <span className="text-[14px] font-semibold text-tc-700">Quote visits</span>
                  <span className="text-[12px] text-tc-500">Your own calendar</span>
                </div>
                {dates.map((date) => (
                  <div key={date} className={`min-h-[72px] space-y-2 border-l border-tc-100 p-2 ${date === today ? 'bg-tc-lime-wash/60' : 'bg-tc-50'}`}>
                    {cards
                      .filter((c) => c.isQuoteVisit && c.slotStart.startsWith(date))
                      .map((c) => (
                        <Link
                          key={c.bookingId}
                          href="/admin/leads"
                          className="block rounded-lg border border-dashed border-tc-300 bg-white px-2.5 py-2 text-xs transition hover:border-tc-900"
                        >
                          <span className="font-semibold tabular-nums text-tc-900">{timeLabel(c.slotStart)}</span>
                          <span className="ml-1.5 rounded bg-tc-100 px-1 py-px text-[10px] font-semibold uppercase tracking-wide text-tc-500">Quote</span>
                          <p className="mt-0.5 truncate font-semibold text-tc-900">{c.clientName}</p>
                          {c.addressLine && <p className="truncate text-tc-500">{c.addressLine}</p>}
                        </Link>
                      ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        {hasForecast && (
          <p className="mt-2 text-right text-[11px] text-tc-500">
            Forecast{weatherPlace ? ` for ${weatherPlace}` : ''} from the National Weather Service · about 7 days ahead
          </p>
        )}
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

function DayHeader({ date, today, weekend, weather }: { date: string; today: boolean; weekend: boolean; weather?: DayWeather }) {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const wd = dt.toLocaleDateString('en-US', { weekday: 'short' });
  return (
    <div
      className={`border-b border-l border-tc-200 px-3 pb-2.5 pt-3 ${today ? 'bg-tc-lime-wash/60 shadow-[inset_0_3px_0_0_#B8FF00]' : weekend ? 'bg-tc-50' : 'bg-white'}`}
      aria-label={`${dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}${weather ? `, ${weather.summary}` : ''}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[11px] font-semibold uppercase tracking-[0.08em] ${today ? 'text-tc-900' : 'text-tc-500'}`}>
          {wd}
          {today && <span className="ml-1.5 normal-case tracking-normal text-tc-lime-ink">Today</span>}
        </span>
        <span
          className={`flex h-8 min-w-8 items-center justify-center rounded-lg px-1.5 font-tc-display text-[17px] font-extrabold tabular-nums ${
            today ? 'bg-tc-black text-tc-lime' : 'text-tc-900'
          }`}
        >
          {d}
        </span>
      </div>
      <div className="mt-2 flex h-5 items-center gap-1.5 text-[12px] text-tc-700" title={weather?.summary}>
        {weather ? (
          <>
            <WeatherIcon kind={weather.kind} />
            <span className="font-semibold tabular-nums text-tc-900">{weather.highF != null ? `${weather.highF}°` : `${weather.lowF}°`}</span>
            {weather.highF != null && weather.lowF != null && <span className="tabular-nums text-tc-500">{weather.lowF}°</span>}
            {weather.rainChance != null && weather.rainChance >= 20 && (
              <span className={`ml-auto flex items-center gap-0.5 tabular-nums ${weather.rainChance >= 60 ? 'font-semibold text-blue-700' : 'text-blue-600'}`}>
                <svg width="10" height="12" viewBox="0 0 10 12" aria-hidden="true">
                  <path d="M5 0.8C3.4 3.2 1 5.6 1 7.9A4 4 0 0 0 9 7.9C9 5.6 6.6 3.2 5 0.8Z" fill="currentColor" />
                </svg>
                {weather.rainChance}%
              </span>
            )}
          </>
        ) : (
          <span className="text-tc-300">—</span>
        )}
      </div>
    </div>
  );
}

function WeatherIcon({ kind }: { kind: WeatherKind }) {
  const sun = (
    <g>
      <circle cx="12" cy="12" r="4.2" fill="#F59E0B" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
        <rect key={a} x="11.2" y="2" width="1.6" height="3.4" rx="0.8" fill="#F59E0B" transform={`rotate(${a} 12 12)`} />
      ))}
    </g>
  );
  const cloud = (fill: string) => <path d="M7.5 19h9.3a3.7 3.7 0 0 0 .3-7.4A5.2 5.2 0 0 0 7 11.3 3.9 3.9 0 0 0 7.5 19Z" fill={fill} />;
  const icons: Record<WeatherKind, React.ReactNode> = {
    sun,
    partly: (
      <>
        <g transform="translate(-3 -3) scale(0.85)">{sun}</g>
        {cloud('#9CA3AF')}
      </>
    ),
    cloud: cloud('#9CA3AF'),
    rain: (
      <>
        <g transform="translate(0 -3)">{cloud('#6B7280')}</g>
        {[8, 12, 16].map((x) => (
          <rect key={x} x={x} y="17.5" width="1.6" height="4" rx="0.8" fill="#3882F6" transform={`rotate(15 ${x} 19)`} />
        ))}
      </>
    ),
    storm: (
      <>
        <g transform="translate(0 -3)">{cloud('#4B5563')}</g>
        <path d="M12.5 15.5 10 19.5h2.2l-1 3.5 3.6-5h-2.3l1-2.5Z" fill="#F59E0B" />
      </>
    ),
    snow: (
      <>
        <g transform="translate(0 -3)">{cloud('#9CA3AF')}</g>
        {[8, 12, 16].map((x) => (
          <circle key={x} cx={x} cy="20" r="1.2" fill="#93C5FD" />
        ))}
      </>
    ),
    fog: (
      <>
        {[8, 12, 16].map((y) => (
          <rect key={y} x="4" y={y} width="16" height="1.8" rx="0.9" fill="#9CA3AF" />
        ))}
      </>
    ),
    wind: (
      <path d="M3 9h11a2.5 2.5 0 1 0-2.5-2.5M3 13h15a2.5 2.5 0 1 1-2.5 2.5M3 17h8" stroke="#6B7280" strokeWidth="1.8" fill="none" strokeLinecap="round" />
    ),
  };
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
      {icons[kind]}
    </svg>
  );
}

function Avatar({ person }: { person: BoardPerson }) {
  const lead = person.staffRole === 'TEAM_LEAD';
  return (
    <span
      title={`${person.name} · ${ROLE_LABELS[person.staffRole]}`}
      className={`relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-bold tracking-tight ring-2 ring-white ${
        lead ? 'bg-tc-black text-tc-lime' : person.staffRole === 'JR_CLEANER' ? 'bg-emerald-100 text-emerald-800' : 'bg-tc-200 text-tc-700'
      }`}
    >
      {initials(person.name)}
    </span>
  );
}

function Cell({ id, tone, warn, disabled, children }: { id: string; tone: string; warn: boolean; disabled: boolean; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled });
  return (
    <div
      ref={setNodeRef}
      className={`min-h-[118px] space-y-2 border-b border-l border-tc-100 p-2 transition-colors ${
        isOver ? 'bg-tc-lime-wash shadow-[inset_0_0_0_2px_#B8FF00]' : warn ? 'bg-amber-50/70' : tone
      }`}
    >
      {children}
    </div>
  );
}

const ACCENT: Record<string, string> = {
  REQUESTED: 'bg-tc-300',
  PENDING: 'bg-tc-black',
  EN_ROUTE: 'bg-tc-blue',
  IN_PROGRESS: 'bg-tc-amber',
  COMPLETE: 'bg-tc-green',
};

function JobCard({ card, personById, onOpen }: { card: BoardCard; personById: Record<string, BoardPerson>; onOpen: () => void }) {
  const canMove = movable(card);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: card.bookingId, disabled: !canMove });
  const staff = card.staff.map((id) => personById[id]).filter(Boolean);
  const accent = card.bookingStatus === 'REQUESTED' ? ACCENT.REQUESTED : ACCENT[card.jobStatus ?? 'PENDING'];
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onOpen}
      style={transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined}
      className={`relative overflow-hidden rounded-lg border border-tc-200 bg-white py-2 pl-3 pr-2 text-left text-xs shadow-[0_1px_2px_rgba(11,15,20,0.06)] transition ${
        canMove ? 'cursor-grab touch-none active:cursor-grabbing' : 'cursor-pointer'
      } ${isDragging ? 'z-50 shadow-tc-lg ring-2 ring-tc-lime' : 'hover:-translate-y-px hover:border-tc-300 hover:shadow-md'}`}
      aria-roledescription={canMove ? 'Draggable job' : 'Job'}
      aria-label={`${card.clientName}, ${timeLabel(card.slotStart)} to ${timeLabel(card.slotEnd)}`}
    >
      <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-[3px] ${accent}`} />
      <span className="block whitespace-nowrap font-semibold tabular-nums text-tc-900">
        {timeLabel(card.slotStart)}–{timeLabel(card.slotEnd)}
      </span>
      <p className="mt-1 truncate text-[13px] font-semibold leading-snug text-tc-900">{card.clientName}</p>
      <p className="truncate text-tc-700">{card.serviceName}</p>
      {card.addressLine && (
        <p className="mt-0.5 flex items-center gap-1 truncate text-tc-500">
          <svg width="10" height="12" viewBox="0 0 10 12" aria-hidden="true" className="shrink-0">
            <path d="M5 0.5A4 4 0 0 0 1 4.5c0 3 4 7 4 7s4-4 4-7a4 4 0 0 0-4-4Zm0 5.6A1.6 1.6 0 1 1 5 2.9a1.6 1.6 0 0 1 0 3.2Z" fill="currentColor" />
          </svg>
          <span className="truncate">{card.addressLine}</span>
        </p>
      )}
      {(staff.length > 0 || (card.jobStatus && card.jobStatus !== 'PENDING') || card.bookingStatus === 'REQUESTED') && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-1">
          <div className="flex -space-x-1">
            {staff.map((p) => (
              <Avatar key={p.id} person={p} />
            ))}
          </div>
          {card.jobStatus && card.jobStatus !== 'PENDING' ? (
            <span className={`whitespace-nowrap rounded-full px-1.5 py-px text-[10px] font-semibold ${STATUS_STYLE[card.jobStatus]}`}>{STATUS_LABEL[card.jobStatus]}</span>
          ) : card.bookingStatus === 'REQUESTED' ? (
            <span className="whitespace-nowrap rounded-full bg-tc-100 px-1.5 py-px text-[10px] font-semibold text-tc-500">Requested</span>
          ) : null}
        </div>
      )}
      {card.jobId && staff.length === 0 && <p className="mt-1.5 text-[10px] font-semibold text-amber-700">Nobody on this job</p>}
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
