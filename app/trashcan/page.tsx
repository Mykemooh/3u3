import Link from 'next/link';
import TcSite, { getTcNav } from '@/components/tc/TcSite';
import Icon from '@/components/Icon';
import ImageSlot from '@/components/tc/ImageSlot';
import { DashboardMockup, PhoneMockup, QuoteVignette, ScheduleVignette, InvoiceVignette, RoomsVignette } from '@/components/tc/Mockups';
import { PLANS, PLAN_ORDER, feeLabel, dollars } from '@/lib/billing/plans';
import type { IconName } from '@/lib/adminNav';

export const dynamic = 'force-dynamic';

const PROOF = [
  'Runs a real cleaning company every day',
  '$0 a month to start',
  'No per-seat fees',
  'AI receptionist included',
  'Export your data any time',
];

const FLOW: { verb: string; title: string; body: string; art: JSX.Element }[] = [
  {
    verb: 'Book it.',
    title: 'Quotes your clients approve from their phone',
    body: 'Walk the home, price it on the spot, send it before you’re back in the truck. Approval opens real slots at that price. Tex answers the inquiries you miss.',
    art: <QuoteVignette />,
  },
  {
    verb: 'Assign it.',
    title: 'A week you can see at a glance',
    body: 'Recurring cleans, templates and a dispatch board with crews down the side. Find a Time picks the slot that keeps crews close, and nobody is ever double-booked.',
    art: <ScheduleVignette />,
  },
  {
    verb: 'Clean it.',
    title: 'Crews who know exactly what’s next',
    body: 'Room-by-room checklists, timers that count up per room, before-and-after photos, and a live “on the way” map for the client. Works without signal, syncs when it’s back.',
    art: <RoomsVignette />,
  },
  {
    verb: 'Get paid.',
    title: 'Invoices that go out on their own',
    body: 'The invoice drafts the moment the crew finishes. Card on file, autopay, tips split to the crew, monthly billing for offices, reminders you never have to send.',
    art: <InvoiceVignette />,
  },
];

const GRID: { icon: IconName; title: string; body: string }[] = [
  { icon: 'jobs', title: 'Jobs', body: 'Checklists, photos, room timers and proof of every visit.' },
  { icon: 'users', title: 'Customers', body: 'Homes, entry notes, rates and history in one profile.' },
  { icon: 'team', title: 'Teams', body: 'Roles you name, pay rules, payroll export and earnings.' },
  { icon: 'calendar', title: 'Schedule', body: 'Dispatch board, recurring cleans, routes and weather watch.' },
  { icon: 'quote', title: 'Quotes', body: 'Line items, add-ons and one-tap approval for clients.' },
  { icon: 'invoice', title: 'Invoices', body: 'Branded invoices, autopay, tips and monthly statements.' },
  { icon: 'star', title: 'Reviews', body: 'Ask happy clients at the right moment; route them to Google.' },
  { icon: 'chart', title: 'Reports', body: 'Revenue by crew and ZIP, profit per clean, retention.' },
];

const INSIGHTS: { tag: string; text: string; action: string }[] = [
  { tag: 'Schedule', text: 'You have 3 cleaners underbooked tomorrow.', action: 'Fill from the waitlist' },
  { tag: 'Live job', text: 'Job #284 is running 37 minutes over estimate.', action: 'Text the client an update' },
  { tag: 'Routes', text: 'Your Tuesday route has 46 minutes of unnecessary drive time.', action: 'Re-order stops' },
  { tag: 'Money', text: '4 invoices are more than 14 days unpaid.', action: 'Send reminders' },
];

export default function TrashCanHome() {
  const nav = getTcNav();
  return (
    <TcSite headerTone="dark">
      {/* ---------------- Hero ---------------- */}
      <section className="tc-dark relative overflow-hidden">
        <div aria-hidden="true" className="tc-grid-bg pointer-events-none absolute inset-0" />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-40 top-10 h-[520px] w-[520px] rounded-full opacity-[0.16] blur-[110px]"
          style={{ background: '#B8FF00' }}
        />
        <div className="relative mx-auto grid max-w-[1280px] items-center gap-12 px-4 pb-20 pt-14 sm:px-6 md:pt-20 lg:grid-cols-[0.9fr_1.25fr] lg:gap-10 lg:px-8 lg:pb-28">
          <div className="animate-tc-rise">
            <h1 className="tc-display text-white">
              Cleaning business, <span className="text-tc-lime">cleaned up.</span>
            </h1>
            <p className="mt-6 max-w-[46ch] text-[18px] leading-relaxed text-white/70">
              TRASHCAN is the all-in-one CRM and operations platform for cleaning businesses. Book jobs, manage your team, get paid — and keep everything in one place.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/start" className="tc-btn-lime tc-btn-lg">
                Get started free
                <Icon name="arrow" size={18} />
              </Link>
              <Link href={nav.pricing} className="tc-btn-ghost-dark tc-btn-lg">
                See pricing
              </Link>
            </div>
            <ul className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-[14px] text-white/55">
              {['Free plan, no card', 'Free client import', 'Live in an afternoon'].map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <Icon name="check" size={16} className="text-tc-lime" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="relative lg:-mr-4 xl:-mr-12">
            <DashboardMockup />
            <PhoneMockup className="absolute -bottom-12 -left-3 hidden w-[21%] min-w-[140px] sm:block lg:-left-12" />
            <p className="mt-3 text-right text-[12px] text-white/35">Sample data</p>
          </div>
        </div>
      </section>

      {/* ---------------- Proof strip ---------------- */}
      <section aria-label="What you get" className="border-b border-tc-200 bg-white">
        <ul className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-center gap-x-8 gap-y-3 px-4 py-6 sm:px-6 lg:justify-between lg:px-8">
          {PROOF.map((p) => (
            <li key={p} className="flex items-center gap-2 text-[14px] font-semibold text-tc-700">
              <span className="h-1.5 w-1.5 rounded-full bg-tc-black" aria-hidden="true" />
              {p}
            </li>
          ))}
        </ul>
      </section>

      {/* ---------------- Workflow ---------------- */}
      <section className="mx-auto max-w-[1280px] px-4 py-20 sm:px-6 md:py-28 lg:px-8">
        <div className="max-w-[760px]">
          <h2 className="tc-h1">Book it. Assign it. Clean it. Get paid.</h2>
          <p className="tc-lead mt-4 max-w-[60ch]">
            One system for the whole day, in the order the day actually runs. Every step hands the next one what it needs, so nothing gets typed twice.
          </p>
        </div>
        <ol className="mt-14 grid gap-px overflow-hidden rounded-tc-lg border border-tc-200 bg-tc-200 md:grid-cols-2">
          {FLOW.map((f, i) => (
            <li key={f.verb} className="flex flex-col gap-6 bg-white p-6 md:p-8">
              <div>
                <p className="font-tc-display text-[15px] font-extrabold text-tc-500">
                  <span className="mr-2 inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-tc-black px-1.5 text-[12px] text-tc-lime">{i + 1}</span>
                  {f.verb}
                </p>
                <h3 className="tc-h3 mt-3">{f.title}</h3>
                <p className="mt-2 max-w-[52ch] text-[15px] leading-relaxed text-tc-700">{f.body}</p>
              </div>
              <div className="mt-auto rounded-xl bg-tc-50 p-4 sm:p-6">{f.art}</div>
            </li>
          ))}
        </ol>
      </section>

      {/* ---------------- Feature grid ---------------- */}
      <section className="border-y border-tc-200 bg-tc-50">
        <div className="mx-auto max-w-[1280px] px-4 py-20 sm:px-6 md:py-24 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <h2 className="tc-h2 max-w-[22ch]">Everything a cleaning business runs on.</h2>
            <Link href={nav.features} className="tc-btn-ghost">
              Explore features <Icon name="arrow" size={16} />
            </Link>
          </div>
          <ul className="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {GRID.map((g) => (
              <li key={g.title} className="border-t border-tc-300 pt-5">
                <span className="flex h-10 w-10 items-center justify-center rounded-tc-md bg-tc-black text-tc-lime">
                  <Icon name={g.icon} size={20} />
                </span>
                <h3 className="mt-4 text-[17px] font-bold">{g.title}</h3>
                <p className="mt-1 text-[15px] leading-relaxed text-tc-700">{g.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---------------- Crew ---------------- */}
      <section className="mx-auto grid max-w-[1280px] items-center gap-12 px-4 py-20 sm:px-6 md:py-28 lg:grid-cols-2 lg:px-8">
        <div className="relative order-last lg:order-first">
          <ImageSlot slot="crew-arrival" aspect="aspect-[16/11]" captionClass="sm:mr-[36%]" />
          {/* Sized like a phone held up to the photo, tucked over its bottom-right corner. */}
          <PhoneMockup className="absolute -bottom-6 -right-2 w-[23%] max-w-[148px] sm:-bottom-8 sm:-right-4" />
        </div>
        <div>
          <h2 className="tc-h1">Your cleaners clean. TRASHCAN handles the rest.</h2>
          <p className="tc-lead mt-4 max-w-[52ch]">
            The crew app is built for a phone in a gloved hand in a house with one bar of signal. Anyone on the job can start the clock when they arrive.
          </p>
          <ul className="mt-8 space-y-4">
            {(
              [
                ['timer', 'Per-room timers', 'Count-up timers on every room, so quotes come from real numbers.'],
                ['camera', 'Photo proof', 'Before and after, per room, shrunk on the phone and sent to the client.'],
                ['map', 'Live arrival', 'Clients watch the crew on the way, like a ride-share.'],
                ['wallet', 'Their own earnings', 'Each cleaner sees their pay, tips and next payday.'],
              ] as [IconName, string, string][]
            ).map(([icon, t, b]) => (
              <li key={t} className="flex gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-tc-md border border-tc-200 bg-white text-tc-black">
                  <Icon name={icon} size={20} />
                </span>
                <span>
                  <span className="block font-bold">{t}</span>
                  <span className="text-[15px] text-tc-700">{b}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---------------- Intelligence ---------------- */}
      <section className="bg-tc-lime-wash">
        <div className="mx-auto max-w-[1280px] px-4 py-20 sm:px-6 md:py-24 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <p className="inline-flex items-center gap-2 rounded-md bg-tc-black px-2.5 py-1 text-[13px] font-bold text-tc-lime">
                <Icon name="bolt" size={14} /> TRASHCAN Intelligence
              </p>
              <h2 className="tc-h1 mt-5">It notices before you do.</h2>
              <p className="tc-lead mt-4 max-w-[50ch]">
                TRASHCAN reads your schedule, live jobs and invoices and tells you what needs a decision — with the fix one tap away. No dashboards to dig through.
              </p>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {INSIGHTS.map((i) => (
                <li key={i.text} className="flex flex-col rounded-tc-lg border border-[#DDEFAA] bg-white p-5 shadow-tc-ring">
                  <span className="text-[12px] font-bold uppercase tracking-[0.06em] text-tc-lime-ink">{i.tag}</span>
                  <p className="mt-2 text-[16px] font-semibold leading-snug">{i.text}</p>
                  <span className="mt-4 inline-flex items-center gap-1.5 text-[14px] font-semibold text-tc-black">
                    {i.action} <Icon name="arrow" size={14} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ---------------- Built by operators ---------------- */}
      <section className="mx-auto grid max-w-[1280px] items-center gap-12 px-4 py-20 sm:px-6 md:py-28 lg:grid-cols-[1.1fr_0.9fr] lg:px-8">
        <ImageSlot slot="founders" aspect="aspect-[3/2]" />
        <div>
          <h2 className="tc-h1">Built inside a real cleaning company.</h2>
          <p className="tc-lead mt-4 max-w-[52ch]">
            TRASHCAN started as the software behind a family-owned cleaning company in Katy, Texas. Every screen was built for a job our own crews were doing that week — then opened up to other cleaning companies.
          </p>
          <p className="mt-4 max-w-[52ch] text-[15px] leading-relaxed text-tc-700">
            That’s why it times rooms instead of promising hours, prices at the door instead of from a form, and pays crews by the rules you set.
          </p>
        </div>
      </section>

      {/* ---------------- Pricing teaser ---------------- */}
      <section className="border-t border-tc-200 bg-tc-50">
        <div className="mx-auto max-w-[1280px] px-4 py-20 sm:px-6 md:py-24 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <h2 className="tc-h2">Start free. Never pay per seat.</h2>
              <p className="tc-lead mt-3 max-w-[56ch]">Pay a small fee only when clients pay you by card — or a flat monthly price that removes it.</p>
            </div>
            <Link href={nav.pricing} className="tc-btn-dark">
              Compare plans <Icon name="arrow" size={16} />
            </Link>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {PLAN_ORDER.map((k) => {
              const p = PLANS[k];
              return (
                <Link key={k} href={nav.pricing} className="tc-card-hover flex items-baseline justify-between gap-4 p-6">
                  <span>
                    <span className="block text-[15px] font-bold">{p.name}</span>
                    <span className="mt-1 block text-[14px] text-tc-500">{feeLabel(p)}</span>
                  </span>
                  <span className="font-tc-display text-[32px] font-extrabold tracking-[-0.03em]">
                    {dollars(p.monthlyCents)}
                    <span className="text-[14px] font-semibold text-tc-500">/mo</span>
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* ---------------- CTA ---------------- */}
      <section className="tc-dark relative overflow-hidden">
        <div aria-hidden="true" className="tc-grid-bg pointer-events-none absolute inset-0" />
        <div className="relative mx-auto max-w-[1280px] px-4 py-20 text-center sm:px-6 md:py-28 lg:px-8">
          <h2 className="tc-display mx-auto max-w-[14ch] text-white">
            Less admin. <span className="text-tc-lime">More clean.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-[46ch] text-[18px] text-white/65">Set up your company in about fifteen minutes. Send us your client list and we’ll import it for free.</p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/start" className="tc-btn-lime tc-btn-lg">
              Get started free <Icon name="arrow" size={18} />
            </Link>
            <Link href={nav.features} className="tc-btn-ghost-dark tc-btn-lg">
              See every feature
            </Link>
          </div>
        </div>
      </section>
    </TcSite>
  );
}
