import type { Metadata } from 'next';
import Link from 'next/link';
import TcSite, { getTcNav } from '@/components/tc/TcSite';
import Icon from '@/components/Icon';
import ImageSlot from '@/components/tc/ImageSlot';
import { QuoteVignette, TexVignette, ScheduleVignette, PhoneMockup, InvoiceVignette, ReportsVignette } from '@/components/tc/Mockups';
import CompareTable from '@/components/tc/CompareTable';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Features',
  description: 'Quotes, scheduling, a crew app with room timers and photo proof, invoicing, payroll, an AI receptionist and reports — built for cleaning businesses.',
};

type Section = {
  id: string;
  label: string;
  title: string;
  body: string;
  points: [string, string][];
  art: JSX.Element;
  dark?: boolean;
};

const SECTIONS: Section[] = [
  {
    id: 'win',
    label: 'Win the job',
    title: 'Answer fast, quote on the spot, close from the client’s phone.',
    body: 'Leads from your website, Angi, Thumbtack or Facebook land in one inbox. Tex picks up the texts and calls you can’t, books the walkthrough, and hands off to you when it should.',
    points: [
      ['Tex, the AI receptionist', 'Answers texts, calls and website chat from your own help articles. Never quotes prices or makes promises.'],
      ['Quotes with one-tap approval', 'Line items and add-ons; approval sets the client’s rate and opens real slots.'],
      ['Leads and pipeline', 'Every client’s stage from new lead to paid, with money totalled per column.'],
      ['Post-construction and commercial', 'Phased quotes for builders and monthly contracts for offices.'],
    ],
    art: (
      <div className="grid gap-4">
        <TexVignette />
        <QuoteVignette />
      </div>
    ),
  },
  {
    id: 'schedule',
    label: 'Schedule',
    title: 'A week you can read in five seconds.',
    body: 'Crews down the side, days across the top, unassigned jobs called out in their own row. Reassigning re-runs the same no-double-booking check that booking does.',
    points: [
      ['Recurring cleans', 'Weekly, bi-weekly or monthly series, with templates for the cleans you schedule most.'],
      ['Find a Time', 'Suggests the slot that keeps a crew close to its other homes that day.'],
      ['Routes', 'Re-orders the day’s stops to cut drive time.'],
      ['Calendar sync and weather watch', 'Jobs in each person’s Google Calendar; rain flagged on outdoor add-ons.'],
    ],
    art: <ScheduleVignette />,
  },
  {
    id: 'clean',
    label: 'Clean',
    title: 'A crew app that works in a house with one bar of signal.',
    body: 'Every action queues on the phone and syncs when it’s back online. Anyone on the job can start the clock when they arrive, and every room keeps its own count-up timer.',
    points: [
      ['Room-by-room checklists', 'The right checklist for each service, with nothing marked done until every room is accounted for.'],
      ['Before-and-after proof', 'Photos and short videos per room, shrunk on the phone, shared with the client as a gallery.'],
      ['Live arrival', 'Clients see the crew on the way, with turn-by-turn directions inside the app.'],
      ['Supplies', 'Crews flag what’s running low; restock alerts fire below the levels you set.'],
    ],
    art: (
      <div className="flex justify-center rounded-tc-lg bg-tc-black p-8">
        <PhoneMockup className="w-[62%] max-w-[260px]" />
      </div>
    ),
    dark: true,
  },
  {
    id: 'paid',
    label: 'Get paid',
    title: 'The invoice is ready before the crew is back in the van.',
    body: 'Finishing a job drafts the invoice at the client’s agreed rate. You review and send; clients pay on a branded page, or autopay charges the card on file.',
    points: [
      ['Card on file and autopay', 'Payments go to your own Stripe account. Card numbers never touch TRASHCAN.'],
      ['Tips to the crew', 'Split evenly or by hours, and treated as wages for payroll.'],
      ['Monthly billing', 'Roll a recurring client’s visits into one statement at month end.'],
      ['Accounting sync', 'QuickBooks or Xero, with payroll export for Gusto.'],
    ],
    art: <InvoiceVignette />,
  },
  {
    id: 'grow',
    label: 'Grow',
    title: 'More of the clients you already like.',
    body: 'Ask for a review at the right moment, reward referrals, and win back clients who drifted — all on autopilot once you switch them on.',
    points: [
      ['Reviews', 'Happy clients are sent to your Google review page; the rest come to you first.'],
      ['Referrals and win-back', 'A credit for every friend who books, and a nudge for clients who’ve gone quiet.'],
      ['Muse', 'Drafts ads, posts and offers in your own voice from your real services.'],
      ['Reports', 'Revenue by crew and ZIP, profit per clean, retention and growth.'],
    ],
    art: <ReportsVignette />,
  },
  {
    id: 'team',
    label: 'Run the team',
    title: 'Pay people fairly, by rules you set.',
    body: 'Per-job, hourly or percentage pay, with payroll runs you can check line by line. Name your own roles and decide exactly what each one can open.',
    points: [
      ['Payroll runs', 'Weekly, bi-weekly or monthly, from the hours and jobs the app recorded.'],
      ['Roles and permissions', 'Rename roles, add your own, and lock any part of the workspace.'],
      ['Background checks', 'Order checks for new hires without leaving TRASHCAN.'],
      ['Security', 'Two-step sign-in for every owner and office user; entry codes encrypted.'],
    ],
    art: <ImageSlot slot="team-huddle" aspect="aspect-[4/3]" />,
  },
];

export default function FeaturesPage() {
  const nav = getTcNav();
  return (
    <TcSite>
      <section className="mx-auto max-w-[1280px] px-4 pb-10 pt-16 sm:px-6 md:pt-24 lg:px-8">
        <h1 className="tc-display max-w-[16ch]">Everything a cleaning business runs on.</h1>
        <p className="tc-lead mt-5 max-w-[58ch]">
          In the order the day actually runs — from the first text to the paid invoice. Every feature is on every plan.
        </p>
      </section>

      <nav aria-label="Feature sections" className="sticky top-16 z-30 border-y border-tc-200 bg-white/90 backdrop-blur-md">
        <ul className="mx-auto flex max-w-[1280px] gap-1 overflow-x-auto px-4 py-2 sm:px-6 lg:px-8 [scrollbar-width:none]">
          {SECTIONS.map((s) => (
            <li key={s.id} className="shrink-0">
              <a href={`#${s.id}`} className="inline-flex min-h-[40px] items-center rounded-lg px-3 text-[14px] font-semibold text-tc-700 hover:bg-tc-100 hover:text-tc-black">
                {s.label}
              </a>
            </li>
          ))}
          <li className="shrink-0">
            <a href="#compare" className="inline-flex min-h-[40px] items-center rounded-lg px-3 text-[14px] font-semibold text-tc-700 hover:bg-tc-100 hover:text-tc-black">
              Compare
            </a>
          </li>
        </ul>
      </nav>

      {SECTIONS.map((s, i) => (
        <section key={s.id} id={s.id} className={`scroll-mt-32 ${i % 2 ? 'bg-tc-50' : 'bg-white'} border-b border-tc-200`}>
          <div className={`mx-auto grid max-w-[1280px] items-center gap-12 px-4 py-20 sm:px-6 md:py-24 lg:grid-cols-2 lg:gap-16 lg:px-8`}>
            <div className={i % 2 ? 'lg:order-last' : ''}>
              <h2 className="tc-h1 max-w-[20ch]">{s.title}</h2>
              <p className="tc-lead mt-4 max-w-[56ch]">{s.body}</p>
              <dl className="mt-8 grid gap-x-8 gap-y-6 sm:grid-cols-2">
                {s.points.map(([t, b]) => (
                  <div key={t}>
                    <dt className="flex items-center gap-2 font-bold">
                      <Icon name="check" size={18} className="text-tc-black" />
                      {t}
                    </dt>
                    <dd className="mt-1 pl-[26px] text-[15px] leading-relaxed text-tc-700">{b}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className={s.dark ? '' : 'rounded-tc-lg bg-tc-100/70 p-5 sm:p-8'}>{s.art}</div>
          </div>
        </section>
      ))}

      <section id="compare" className="scroll-mt-32 mx-auto max-w-[1280px] px-4 py-20 sm:px-6 md:py-24 lg:px-8">
        <h2 className="tc-h1 max-w-[20ch]">How TRASHCAN compares.</h2>
        <p className="tc-lead mt-4 max-w-[60ch]">For a five-person cleaning company. Competitor prices are from their published plans and change over time.</p>
        <CompareTable className="mt-10" />
      </section>

      <section className="tc-dark">
        <div className="mx-auto flex max-w-[1280px] flex-col items-start justify-between gap-8 px-4 py-16 sm:px-6 md:flex-row md:items-center lg:px-8">
          <h2 className="tc-h1 max-w-[18ch] text-white">
            Every feature. <span className="text-tc-lime">Every plan.</span>
          </h2>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link href="/start" className="tc-btn-lime tc-btn-lg">
              Get started free <Icon name="arrow" size={18} />
            </Link>
            <Link href={nav.pricing} className="tc-btn-ghost-dark tc-btn-lg">
              See pricing
            </Link>
          </div>
        </div>
      </section>
    </TcSite>
  );
}
