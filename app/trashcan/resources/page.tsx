import type { Metadata } from 'next';
import Link from 'next/link';
import TcSite, { getTcNav } from '@/components/tc/TcSite';
import Icon from '@/components/Icon';
import type { IconName } from '@/lib/adminNav';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Resources',
  description: 'Switching guides, setup help, system status and the legal pages for TRASHCAN.',
};

const STEPS: [string, string][] = [
  ['Export your clients', 'From Jobber, ZenMaid, Housecall Pro or a spreadsheet — names, phones, addresses and notes. A CSV is all we need.'],
  ['Send it to us', 'Upload it during setup or email it once you’re in. We import it for free and tell you anything that didn’t match.'],
  ['Set your services and rates', 'The setup guide walks you through services, add-ons and each client’s agreed price.'],
  ['Invite your team', 'Add cleaners and office staff, pick their roles, and they’re on the crew app the same day.'],
  ['Connect payments', 'Link your Stripe account so clients pay you directly. Card numbers never touch TRASHCAN.'],
];

export default function ResourcesPage() {
  const nav = getTcNav();
  const links: { icon: IconName; title: string; body: string; href: string }[] = [
    { icon: 'layers', title: 'Every feature', body: 'What TRASHCAN does, in the order the day runs.', href: nav.features },
    { icon: 'wallet', title: 'Pricing and plans', body: 'Free, Crew and Team — and how the fee works.', href: nav.pricing },
    { icon: 'shield', title: 'System status', body: 'Live health of the app, payments and texting.', href: '/status' },
    { icon: 'lock', title: 'Privacy', body: 'What’s collected, who it belongs to, and how it’s protected.', href: '/privacy' },
    { icon: 'invoice', title: 'Terms', body: 'The plain-language agreement for running on TRASHCAN.', href: '/terms' },
  ];
  return (
    <TcSite>
      <section className="mx-auto max-w-[1280px] px-4 pb-12 pt-16 sm:px-6 md:pt-24 lg:px-8">
        <h1 className="tc-display max-w-[14ch]">Switching is the easy part.</h1>
        <p className="tc-lead mt-5 max-w-[56ch]">Most companies move over in an afternoon. Here’s how it goes, and where to find everything else.</p>
      </section>

      <section className="mx-auto max-w-[1280px] px-4 pb-20 sm:px-6 lg:px-8">
        <ol className="grid gap-px overflow-hidden rounded-tc-lg border border-tc-200 bg-tc-200 md:grid-cols-5">
          {STEPS.map(([t, b], i) => (
            <li key={t} className="bg-white p-6">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-tc-black font-tc-display text-[14px] font-extrabold text-tc-lime">{i + 1}</span>
              <p className="mt-4 text-[16px] font-bold">{t}</p>
              <p className="mt-2 text-[14px] leading-relaxed text-tc-700">{b}</p>
            </li>
          ))}
        </ol>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Link href="/start" className="tc-btn-dark">
            Start free and import <Icon name="arrow" size={16} />
          </Link>
          <span className="text-[14px] text-tc-500">No card needed.</span>
        </div>
      </section>

      <section className="border-t border-tc-200 bg-tc-50">
        <div className="mx-auto max-w-[1280px] px-4 py-20 sm:px-6 lg:px-8">
          <h2 className="tc-h2">Everything else</h2>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {links.map((l) => (
              <li key={l.title}>
                <Link href={l.href} className="tc-card-hover group flex h-full items-start gap-4 p-5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-tc-md bg-tc-100 text-tc-black transition-colors group-hover:bg-tc-black group-hover:text-tc-lime">
                    <Icon name={l.icon} size={20} />
                  </span>
                  <span>
                    <span className="flex items-center gap-1.5 font-bold">
                      {l.title} <Icon name="arrow" size={14} className="transition-transform group-hover:translate-x-0.5" />
                    </span>
                    <span className="mt-1 block text-[14px] text-tc-700">{l.body}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </TcSite>
  );
}
