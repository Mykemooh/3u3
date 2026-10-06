/**
 * Product pictures for TrashCan's marketing site, drawn in HTML rather than
 * exported as screenshots, so they stay sharp, match the live product's
 * tokens, and never go stale against a design change. Every number in them
 * is sample data and is labelled as such where it appears.
 *
 * The big frames (dashboard, phone) scale as a picture: the frame is a
 * size container and everything inside is sized in em off a base of 1cqw,
 * so the whole composition shrinks proportionally on small screens.
 */

import { TcIcon } from '@/components/tc/TcLogo';

type Status = 'done' | 'cleaning' | 'enroute' | 'over' | 'scheduled';
const STATUS: Record<Status, { label: string; cls: string }> = {
  done: { label: 'Done', cls: 'bg-emerald-50 text-emerald-700' },
  cleaning: { label: 'Cleaning', cls: 'bg-tc-lime-wash text-tc-lime-ink' },
  enroute: { label: 'On the way', cls: 'bg-blue-50 text-blue-700' },
  over: { label: 'Running over', cls: 'bg-amber-50 text-amber-700' },
  scheduled: { label: 'Scheduled', cls: 'bg-tc-100 text-tc-700' },
};

function Dot({ s }: { s: Status }) {
  return (
    <span className={`inline-flex items-center gap-[0.4em] rounded-[0.4em] px-[0.55em] py-[0.18em] text-[0.82em] font-semibold ${STATUS[s].cls}`}>
      <span className="h-[0.45em] w-[0.45em] rounded-full bg-current" />
      {STATUS[s].label}
    </span>
  );
}

const RAIL = ['home', 'cal', 'users', 'doc', 'inv', 'chart', 'team', 'gear'] as const;
function RailGlyph({ k }: { k: (typeof RAIL)[number] }) {
  const p: Record<string, JSX.Element> = {
    home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9.5Z" />,
    cal: <path d="M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM3 10h18M8 3v4M16 3v4" />,
    users: <path d="M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.8c1.6.8 2.6 2.5 3 5.2" />,
    doc: <path d="M6 3h9l4 4v14H6zM15 3v4h4M9.5 12h6M9.5 15.5h6" />,
    inv: <path d="M3 5.5h18v13H3zM3 10h18M7 15h3" />,
    chart: <path d="M3 17l6-6 4 4 8-8M15 7h6v6" />,
    team: <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c1-4 4.2-6 8-6s7 2 8 6" />,
    gear: <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />,
  };
  return (
    <svg viewBox="0 0 24 24" className="h-[1.45em] w-[1.45em]" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {p[k]}
    </svg>
  );
}

// Revenue, last 14 days — sample.
const REV = [1820, 2140, 1960, 2380, 2210, 980, 640, 2050, 2460, 2290, 2610, 2480, 1120, 2840];

function RevenueChart() {
  const w = 600;
  const h = 170;
  const max = 3000;
  const step = w / (REV.length - 1);
  const pts = REV.map((v, i) => [i * step, h - (v / max) * h] as const);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${w},${h} L0,${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h + 4}`} className="h-auto w-full overflow-visible" aria-hidden="true">
      <defs>
        <linearGradient id="tc-rev-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#B8FF00" stopOpacity="0.35" />
          <stop offset="1" stopColor="#B8FF00" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1="0" x2={w} y1={h * f} y2={h * f} stroke="#EEF0F2" strokeWidth="1" />
      ))}
      <path d={area} fill="url(#tc-rev-fill)" />
      <path d={line} fill="none" stroke="#0B0F14" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="5" fill="#B8FF00" stroke="#0B0F14" strokeWidth="2" />
    </svg>
  );
}

/** The owner's dashboard, as a picture. */
export function DashboardMockup({ className = '' }: { className?: string }) {
  const metrics: [string, string, string, string?][] = [
    ['Jobs today', '18', '+3 vs last Tue'],
    ['Completed', '14', '78% of today'],
    ['Issues', '3', 'Need a look', 'amber'],
    ['Revenue', '$2,840', 'Collected today'],
  ];
  const route: [string, string, string, Status][] = [
    ['8:00', 'Kovacs · Standard', 'Crew A · Ana, Luis', 'done'],
    ['9:30', 'Patel · Deep clean', 'Crew B · Grace, Joy', 'cleaning'],
    ['10:15', 'Whitfield · Move-out', 'Crew A · Ana, Luis', 'over'],
    ['12:00', 'Okafor · Standard', 'Crew C · Sam', 'enroute'],
    ['1:30', 'Brennan · Bi-weekly', 'Crew B · Grace, Joy', 'scheduled'],
  ];
  const team: [string, number, string][] = [
    ['Crew A', 92, '6 jobs · 98% on time'],
    ['Crew B', 81, '5 jobs · 100% on time'],
    ['Crew C', 64, '3 jobs · 1 running over'],
  ];
  return (
    <div className={`relative [container-type:inline-size] ${className}`}>
      <div
        className="overflow-hidden rounded-[1.4em] border border-white/10 bg-white text-tc-900 shadow-[0_40px_120px_-30px_rgba(0,0,0,0.65)] ring-1 ring-black/5"
        style={{ fontSize: '1cqw' }}
      >
        {/* window bar */}
        <div className="flex items-center gap-[0.6em] border-b border-tc-200 bg-tc-50 px-[1.2em] py-[0.8em]">
          <span className="h-[0.8em] w-[0.8em] rounded-full bg-tc-300" />
          <span className="h-[0.8em] w-[0.8em] rounded-full bg-tc-300" />
          <span className="h-[0.8em] w-[0.8em] rounded-full bg-tc-300" />
          <span className="mx-auto rounded-[0.5em] bg-white px-[1.2em] py-[0.25em] text-[0.85em] text-tc-500 ring-1 ring-tc-200">app.trashcan · Today</span>
        </div>
        <div className="flex">
          {/* rail */}
          <div className="flex w-[5.2em] shrink-0 flex-col items-center gap-[0.9em] bg-tc-black py-[1.2em] text-white/55">
            <TcIcon size="2.1em" />
            <div className="h-px w-[2.4em] bg-white/10" />
            {RAIL.map((k, i) => (
              <span
                key={k}
                className={`flex h-[2.6em] w-[2.6em] items-center justify-center rounded-[0.7em] ${i === 0 ? 'bg-tc-lime/15 text-tc-lime' : ''}`}
              >
                <RailGlyph k={k} />
              </span>
            ))}
          </div>
          {/* workspace */}
          <div className="min-w-0 flex-1 bg-[#F6F7F9] p-[1.6em]">
            <div className="flex items-center justify-between gap-[1em]">
              <div>
                <p className="text-[0.95em] text-tc-500">Tuesday, October 6</p>
                <p className="font-tc-display text-[2em] font-extrabold tracking-[-0.03em]">Good morning, Mike.</p>
              </div>
              <div className="flex items-center gap-[0.8em]">
                <span className="hidden w-[16em] items-center gap-[0.5em] rounded-[0.7em] bg-white px-[0.9em] py-[0.55em] text-[0.95em] text-tc-500 ring-1 ring-tc-200 sm:flex">
                  <svg viewBox="0 0 24 24" className="h-[1.1em] w-[1.1em]" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></svg>
                  Search clients, jobs…
                </span>
                <span className="rounded-[0.7em] bg-tc-black px-[1em] py-[0.55em] text-[0.95em] font-semibold text-white">+ New job</span>
              </div>
            </div>

            <div className="mt-[1.4em] grid grid-cols-4 gap-[1em]">
              {metrics.map(([label, big, sub, tone]) => (
                <div key={label} className="rounded-[1em] bg-white p-[1.1em] ring-1 ring-tc-200">
                  <p className="text-[0.92em] font-medium text-tc-500">{label}</p>
                  <p className="mt-[0.2em] font-tc-display text-[2.3em] font-extrabold leading-none tracking-[-0.03em]">{big}</p>
                  <p className={`mt-[0.5em] text-[0.85em] ${tone === 'amber' ? 'font-semibold text-amber-700' : 'text-tc-500'}`}>{sub}</p>
                </div>
              ))}
            </div>

            <div className="mt-[1em] grid grid-cols-[1.45fr_1fr] gap-[1em]">
              <div className="flex flex-col gap-[1em]">
                <div className="rounded-[1em] bg-white p-[1.2em] ring-1 ring-tc-200">
                  <div className="flex items-baseline justify-between">
                    <p className="text-[1.05em] font-semibold">Revenue</p>
                    <p className="text-[0.85em] text-tc-500">Last 14 days · $28,430</p>
                  </div>
                  <div className="mt-[0.8em]">
                    <RevenueChart />
                  </div>
                </div>
                <div className="rounded-[1em] bg-white p-[1.2em] ring-1 ring-tc-200">
                  <p className="text-[1.05em] font-semibold">Team performance</p>
                  <ul className="mt-[0.8em] grid grid-cols-3 gap-[1.2em]">
                    {team.map(([name, pct, note]) => (
                      <li key={name}>
                        <div className="flex justify-between text-[0.92em]">
                          <span className="font-semibold">{name}</span>
                          <span className="tabular-nums text-tc-500">{pct}%</span>
                        </div>
                        <div className="mt-[0.35em] h-[0.5em] rounded-full bg-tc-100">
                          <div className="h-full rounded-full bg-tc-black" style={{ width: `${pct}%` }} />
                        </div>
                        <p className="mt-[0.3em] text-[0.82em] text-tc-500">{note}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="flex flex-col gap-[1em]">
                <div className="rounded-[1em] bg-white p-[1.2em] ring-1 ring-tc-200">
                  <p className="mb-[0.6em] text-[1.05em] font-semibold">Today’s route</p>
                  <ul className="space-y-[0.6em]">
                    {route.map(([t, who, , s]) => (
                      <li key={t} className="flex items-center gap-[0.7em] text-[0.92em]">
                        <span className="w-[3em] shrink-0 tabular-nums text-tc-500">{t}</span>
                        <span className="min-w-0 flex-1 truncate font-semibold">{who.split(' · ')[0]}</span>
                        <Dot s={s} />
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex-1 rounded-[1em] bg-tc-lime-wash p-[1.2em] ring-1 ring-[#E3F5A8]">
                  <p className="flex items-center gap-[0.4em] text-[0.92em] font-bold text-tc-lime-ink">
                    <svg viewBox="0 0 24 24" className="h-[1.1em] w-[1.1em]" fill="currentColor" aria-hidden="true"><path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12z" /></svg>
                    TRASHCAN Intelligence
                  </p>
                  <ul className="mt-[0.6em] space-y-[0.55em] text-[0.92em] leading-snug text-tc-900">
                    <li>Job #284 is running 37 min over estimate.</li>
                    <li>3 cleaners are underbooked tomorrow.</li>
                    <li>Tuesday’s route has 46 min of extra drive time.</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The crew app on a phone, as a picture. */
export function PhoneMockup({ className = '' }: { className?: string }) {
  const rooms: [string, string, 'done' | 'live' | 'next'][] = [
    ['Kitchen', '22:10', 'done'],
    ['Living room', '14:36', 'live'],
    ['Primary bath', '—', 'next'],
    ['Bedrooms (3)', '—', 'next'],
  ];
  return (
    <div className={`[container-type:inline-size] ${className}`}>
      <div className="rounded-[13%/6%] bg-tc-black p-[3.2%] shadow-[0_40px_90px_-30px_rgba(0,0,0,0.7)] ring-1 ring-white/10" style={{ fontSize: '4.2cqw' }}>
        <div className="overflow-hidden rounded-[10.5%/4.9%] bg-white text-tc-900">
          <div className="flex items-center justify-between px-[1.1em] pb-[0.4em] pt-[0.8em] text-[0.7em] font-semibold">
            <span>9:41</span>
            <span className="h-[1.1em] w-[4.6em] rounded-full bg-tc-black" />
            <span>5G</span>
          </div>
          <div className="bg-tc-black px-[1.1em] pb-[1em] pt-[0.6em] text-white">
            <p className="text-[0.7em] text-white/60">Job #284 · Standard clean</p>
            <p className="font-tc-display text-[1.25em] font-extrabold tracking-[-0.02em]">Patel home</p>
            <div className="mt-[0.6em] flex items-center justify-between rounded-[0.6em] bg-white/10 px-[0.7em] py-[0.5em]">
              <span className="text-[0.72em] text-white/70">On site</span>
              <span className="font-tc-display text-[1.05em] font-bold tabular-nums text-tc-lime">1:12:46</span>
            </div>
          </div>
          <div className="space-y-[0.5em] p-[0.9em]">
            {rooms.map(([room, t, s]) => (
              <div
                key={room}
                className={`flex items-center justify-between rounded-[0.6em] px-[0.75em] py-[0.6em] ${
                  s === 'live' ? 'bg-tc-lime-wash ring-1 ring-[#DDF59A]' : 'bg-tc-50 ring-1 ring-tc-100'
                }`}
              >
                <span className="flex items-center gap-[0.5em] text-[0.78em] font-semibold">
                  <span
                    className={`flex h-[1.3em] w-[1.3em] items-center justify-center rounded-full text-[0.8em] ${
                      s === 'done' ? 'bg-tc-black text-tc-lime' : s === 'live' ? 'bg-tc-lime text-tc-black' : 'bg-white ring-1 ring-tc-300'
                    }`}
                  >
                    {s === 'done' ? (
                      <svg viewBox="0 0 24 24" className="h-[0.9em] w-[0.9em]" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
                    ) : null}
                  </span>
                  {room}
                </span>
                <span className={`text-[0.75em] tabular-nums ${s === 'live' ? 'font-bold text-tc-lime-ink' : 'text-tc-500'}`}>{t}</span>
              </div>
            ))}
            <div className="grid grid-cols-2 gap-[0.4em] pt-[0.2em]">
              {['Before', 'After'].map((l, i) => (
                <div key={l} className={`relative aspect-[4/3] overflow-hidden rounded-[0.5em] ${i ? 'bg-gradient-to-br from-[#E9EEF2] to-[#F7F9FA]' : 'bg-gradient-to-br from-[#C9CED3] to-[#DCE0E4]'}`}>
                  <span className="absolute bottom-[0.3em] left-[0.4em] rounded-[0.3em] bg-black/60 px-[0.35em] text-[0.55em] font-semibold text-white">{l}</span>
                </div>
              ))}
            </div>
            <div className="rounded-[0.6em] bg-tc-black py-[0.65em] text-center text-[0.8em] font-semibold text-white">Finish living room</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---- Small feature vignettes (normal pixel sizes, sit inside cards) ---- */

export function QuoteVignette() {
  return (
    <div className="rounded-xl bg-white p-4 text-[13px] shadow-tc-ring">
      <div className="flex items-center justify-between">
        <span className="font-semibold">Quote Q-1042 · Whitfield</span>
        <span className="tc-status bg-blue-50 text-blue-700">Sent</span>
      </div>
      <ul className="mt-3 space-y-1.5 text-tc-700">
        <li className="flex justify-between"><span>Move-out clean, 4 bed</span><span className="tabular-nums">$420.00</span></li>
        <li className="flex justify-between"><span>Inside oven + fridge</span><span className="tabular-nums">$60.00</span></li>
        <li className="flex justify-between"><span>Interior windows</span><span className="tabular-nums">$45.00</span></li>
      </ul>
      <div className="mt-3 flex items-center justify-between border-t border-tc-100 pt-3">
        <span className="font-semibold">Total</span>
        <span className="font-tc-display text-lg font-extrabold tabular-nums">$525.00</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-center text-[12px] font-semibold">
        <span className="rounded-lg bg-tc-black py-2 text-white">Approve</span>
        <span className="rounded-lg py-2 text-tc-700 ring-1 ring-tc-200">Ask a question</span>
      </div>
    </div>
  );
}

export function ScheduleVignette() {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const blocks: [number, number, number, string, boolean?][] = [
    [0, 0, 2, 'Kovacs'],
    [0, 3, 2, 'Lee'],
    [1, 1, 3, 'Patel', true],
    [2, 0, 2, 'Brennan'],
    [2, 2, 2, 'Diaz'],
    [3, 1, 2, 'Okafor'],
    [4, 0, 3, 'Whitfield'],
  ];
  return (
    <div className="rounded-xl bg-white p-3 text-[11px] shadow-tc-ring">
      <div className="grid grid-cols-5 gap-1.5">
        {days.map((d) => (
          <span key={d} className="pb-1 text-center font-semibold text-tc-500">{d}</span>
        ))}
        {days.map((d, col) => (
          <div key={d} className="relative h-[120px] rounded-md bg-tc-50">
            {blocks
              .filter((b) => b[0] === col)
              .map(([, top, len, name, hot]) => (
                <span
                  key={name}
                  className={`absolute inset-x-1 rounded-[5px] px-1.5 py-1 font-semibold ${hot ? 'bg-tc-lime text-tc-black' : 'bg-tc-black text-white'}`}
                  style={{ top: `${top * 22 + 4}px`, height: `${len * 22 - 4}px` }}
                >
                  {name}
                </span>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function InvoiceVignette() {
  return (
    <div className="rounded-xl bg-white p-4 text-[13px] shadow-tc-ring">
      <div className="flex items-center justify-between">
        <span className="font-semibold">INV-1187</span>
        <span className="tc-status bg-emerald-50 text-emerald-700">Paid</span>
      </div>
      <p className="mt-2 font-tc-display text-2xl font-extrabold tabular-nums">$186.00</p>
      <p className="text-tc-500">Card on file · autopay · tip $20 to Crew B</p>
      <div className="mt-3 h-1.5 rounded-full bg-tc-100">
        <div className="h-full w-full rounded-full bg-tc-black" />
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-tc-500">
        <span>Booked</span><span>Cleaned</span><span>Invoiced</span><span className="font-semibold text-tc-900">Paid</span>
      </div>
    </div>
  );
}

export function TexVignette() {
  return (
    <div className="space-y-2 rounded-xl bg-white p-4 text-[13px] shadow-tc-ring">
      <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-tc-100 px-3 py-2">Can you come Thursday instead of Friday?</p>
      <p className="w-fit max-w-[88%] rounded-2xl rounded-bl-md bg-tc-black px-3 py-2 text-white">
        Thursday 10:00 is open with your usual crew. Want me to move it?
      </p>
      <p className="ml-auto w-fit rounded-2xl rounded-br-md bg-tc-100 px-3 py-2">Yes please</p>
      <p className="flex items-center gap-1.5 pt-1 text-[11px] text-tc-500">
        <span className="h-1.5 w-1.5 rounded-full bg-tc-green" /> Tex moved the clean · owner notified
      </p>
    </div>
  );
}

export function ReportsVignette() {
  const bars = [42, 55, 48, 66, 61, 74, 70, 82];
  return (
    <div className="rounded-xl bg-white p-4 text-[12px] shadow-tc-ring">
      <div className="flex items-baseline justify-between">
        <span className="font-semibold">Profit per clean</span>
        <span className="font-tc-display text-lg font-extrabold">$71</span>
      </div>
      <div className="mt-3 flex h-[84px] items-end gap-1.5">
        {bars.map((b, i) => (
          <span key={i} className={`flex-1 rounded-t-[3px] ${i === bars.length - 1 ? 'bg-tc-lime ring-1 ring-tc-black' : 'bg-tc-black/80'}`} style={{ height: `${b}%` }} />
        ))}
      </div>
    </div>
  );
}

export function RoomsVignette() {
  const rooms: [string, string, 'done' | 'live' | 'next'][] = [
    ['Kitchen', '22:10', 'done'],
    ['Living room', '14:36', 'live'],
    ['Primary bath', '—', 'next'],
  ];
  return (
    <div className="rounded-xl bg-white p-4 text-[13px] shadow-tc-ring">
      <div className="flex items-center justify-between">
        <span className="font-semibold">Patel home · Crew B</span>
        <span className="flex items-center gap-1.5 text-[12px] text-tc-500">
          <span className="h-1.5 w-1.5 rounded-full bg-tc-green" /> On site 1:12
        </span>
      </div>
      <ul className="mt-3 space-y-2">
        {rooms.map(([room, t, s]) => (
          <li
            key={room}
            className={`flex items-center justify-between rounded-lg px-3 py-2 ${s === 'live' ? 'bg-tc-lime-wash ring-1 ring-[#DDF59A]' : 'bg-tc-50'}`}
          >
            <span className="flex items-center gap-2 font-semibold">
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full ${
                  s === 'done' ? 'bg-tc-black text-tc-lime' : s === 'live' ? 'bg-tc-lime' : 'bg-white ring-1 ring-tc-300'
                }`}
              >
                {s === 'done' && (
                  <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
                )}
              </span>
              {room}
            </span>
            <span className={`tabular-nums ${s === 'live' ? 'font-bold text-tc-lime-ink' : 'text-tc-500'}`}>{t}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {['Before', 'After'].map((l, i) => (
          <div key={l} className={`relative aspect-[5/3] overflow-hidden rounded-lg ${i ? 'bg-gradient-to-br from-[#E9EEF2] to-[#F7F9FA]' : 'bg-gradient-to-br from-[#C9CED3] to-[#DCE0E4]'}`}>
            <span className="absolute bottom-1 left-1.5 rounded bg-black/60 px-1.5 text-[10px] font-semibold text-white">{l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
