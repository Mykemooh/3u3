import type { Metadata } from 'next';
import Link from 'next/link';
import TcSite, { getTcNav } from '@/components/tc/TcSite';
import PlanPicker from '@/components/tc/PlanPicker';
import CompareTable from '@/components/tc/CompareTable';
import Icon from '@/components/Icon';
import { USAGE, dollars } from '@/lib/billing/plans';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Free to start, no per-seat fees, AI receptionist included. Pay a small fee on card payments, or a flat monthly price that removes it.',
};

const EVERY_PLAN = [
  'Unlimited users, clients and jobs',
  'Scheduling, recurring cleans and online booking',
  'Client portal and crew app',
  'Per-room timers and room-time reports',
  'Live crew tracking for your clients',
  'Before-and-after photo proof',
  'Quotes, invoices, autopay and tips',
  'Payroll runs and accounting sync',
  'Tex web chat on your site',
  'Reviews, referrals and Muse',
  'Two-step sign-in for every owner',
  'Export all your data, any time',
];

const ADDONS: [string, string][] = [
  ['AI receptionist', 'Jobber and Housecall Pro sell it separately. Tex is on every TRASHCAN plan.'],
  ['Marketing tools', 'Reviews, referrals, win-back and Muse are included, not a suite to buy.'],
  ['Extra seats', 'Add your whole crew. The price never changes with headcount.'],
];

const FAQ: [string, string][] = [
  ['Is the Free plan really free?', 'Yes — there is no monthly bill. When a client pays you by card through TRASHCAN, 1% of that payment is the platform fee. Cash, checks and Zelle cost nothing.'],
  ['Who processes card payments?', 'Stripe. You connect your own Stripe account and payments go straight to your bank. Stripe’s standard processing fee applies the same way it would with any software.'],
  ['How do texts and Tex phone calls work?', `You load credits by card, with optional auto top-up. Texts are ${USAGE.smsSegmentCents}¢ each and Tex phone minutes are ${USAGE.voiceMinuteCents}¢. Crew and Team include a monthly allowance. If credits run out, texts and calls pause — email, the app and Tex web chat keep working.`],
  ['What is the texting setup fee?', `It’s ${dollars(USAGE.textingSetupCents)} once, only if you want texting or Tex on the phone. It covers your business number and the carrier registration US law requires for business texting. The number is ${dollars(USAGE.phoneNumberMonthlyCents)} a month after that.`],
  ['Can I switch plans?', 'Any time, from Settings → Plan & credits. TRASHCAN shows which plan would have cost you least last month, so you never have to work it out.'],
  ['What happens if a payment for Crew or Team fails?', 'You drop to the Free plan. Nothing is locked, deleted or paused — your team keeps working and the 1% fee applies until you’re back on a paid plan.'],
  ['Can I leave with my data?', 'Yes. Export clients, invoices, cleans, payroll, expenses and room times as spreadsheets whenever you like.'],
];

export default function PricingPage() {
  const nav = getTcNav();
  return (
    <TcSite>
      <section className="mx-auto max-w-[1280px] px-4 pb-8 pt-16 sm:px-6 md:pt-24 lg:px-8">
        <h1 className="tc-display max-w-[15ch]">Start free. Never pay per seat.</h1>
        <p className="tc-lead mt-5 max-w-[58ch]">
          Every feature is on every plan. You pay a small fee only when clients pay you by card — or a flat monthly price that lowers or removes it.
        </p>
      </section>

      <section aria-label="Plans" className="mx-auto max-w-[1280px] px-4 pb-20 sm:px-6 lg:px-8">
        <PlanPicker />
        <p className="mt-6 text-[14px] text-tc-500">
          Usage, all plans: extra texts {USAGE.smsSegmentCents}¢ · extra Tex phone minutes {USAGE.voiceMinuteCents}¢ · business number and texting registration {dollars(USAGE.textingSetupCents)} once, then {dollars(USAGE.phoneNumberMonthlyCents)}/month. Prepaid, so you’re never surprised by a bill.
        </p>
      </section>

      <section className="border-y border-tc-200 bg-tc-50">
        <div className="mx-auto grid max-w-[1280px] gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:px-8">
          <div>
            <h2 className="tc-h1 max-w-[14ch]">Every plan includes everything.</h2>
            <p className="tc-lead mt-4 max-w-[46ch]">No feature tiers to decode. Plans only change what you pay and how many texts and calls are included.</p>
          </div>
          <ul className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
            {EVERY_PLAN.map((f) => (
              <li key={f} className="flex items-start gap-3 border-b border-tc-200 pb-3 text-[15px] font-medium">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-tc-black text-tc-lime">
                  <Icon name="check" size={14} />
                </span>
                {f}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-[1280px] px-4 py-20 sm:px-6 lg:px-8">
        <h2 className="tc-h2">No add-ons to buy later.</h2>
        <div className="mt-8 grid gap-px overflow-hidden rounded-tc-lg border border-tc-200 bg-tc-200 md:grid-cols-3">
          {ADDONS.map(([t, b]) => (
            <div key={t} className="bg-white p-6">
              <p className="text-[17px] font-bold">{t}</p>
              <p className="mt-2 text-[15px] leading-relaxed text-tc-700">{b}</p>
            </div>
          ))}
        </div>

        <h2 className="tc-h2 mt-20">How TRASHCAN compares.</h2>
        <p className="mt-3 max-w-[60ch] text-[15px] text-tc-700">For a five-person cleaning company. Competitor prices are from their published plans and change over time.</p>
        <CompareTable className="mt-8" />
      </section>

      <section className="border-t border-tc-200 bg-tc-50">
        <div className="mx-auto grid max-w-[1280px] gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[0.7fr_1.3fr] lg:px-8">
          <h2 className="tc-h1">Questions</h2>
          <div className="divide-y divide-tc-200 border-y border-tc-200">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group py-1">
                <summary className="flex min-h-[56px] cursor-pointer list-none items-center justify-between gap-4 text-[16px] font-semibold [&::-webkit-details-marker]:hidden">
                  {q}
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-tc-300 transition-transform duration-200 group-open:rotate-45">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                  </span>
                </summary>
                <p className="max-w-[65ch] pb-5 text-[15px] leading-relaxed text-tc-700">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="tc-dark">
        <div className="mx-auto flex max-w-[1280px] flex-col items-start justify-between gap-8 px-4 py-16 sm:px-6 md:flex-row md:items-center lg:px-8">
          <div>
            <h2 className="tc-h1 text-white">
              $0 to start. <span className="text-tc-lime">Today.</span>
            </h2>
            <p className="mt-3 text-[17px] text-white/65">No card. Free client import. About fifteen minutes to set up.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link href="/start" className="tc-btn-lime tc-btn-lg">
              Get started free <Icon name="arrow" size={18} />
            </Link>
            <Link href={nav.features} className="tc-btn-ghost-dark tc-btn-lg">
              See features
            </Link>
          </div>
        </div>
      </section>
    </TcSite>
  );
}
