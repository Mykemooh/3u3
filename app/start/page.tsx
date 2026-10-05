import type { Metadata } from 'next';
import PlatformShell from '@/components/PlatformShell';
import SignupFlow from '@/components/signup/SignupFlow';
import { signupIsOpen, SIGNUP_QUESTIONS } from '@/lib/signup';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Start your cleaning company on TrashCan',
  description: 'Scheduling, quotes, crews, payroll, two-way texting and an AI receptionist — built for cleaning companies.',
};

const POINTS = [
  ['Quotes that close', 'Walk the home, price it on the spot, and the client approves from their phone. Post-construction phases and commercial contracts included.'],
  ['A schedule that fills itself', 'Recurring cleans, templates, and Find a Time picks the slot that keeps your crews close together.'],
  ['Crews who know the plan', 'Room-by-room checklists, before-and-after photos, room timers and their own earnings — on their phone.'],
  ['Paid without chasing', 'Card on file, autopay, monthly billing for offices, tips, and reminders that go out on their own.'],
  ['Tex answers when you can’t', 'An AI receptionist for texts, calls and your portals, trained on your own help articles — and it hands off to you.'],
] as const;

export default async function StartPage() {
  const open = await signupIsOpen();
  return (
    <PlatformShell>
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:py-16">
        <section>
          <p className="eyebrow">For cleaning companies</p>
          <h1 className="display mt-3 max-w-xl">Run the whole business from one place.</h1>
          <p className="lead mt-4 max-w-lg">
            TrashCan is the software behind 3U3 Cleaning in Katy, Texas — now open to other cleaning companies.
          </p>
          <ul className="mt-8 space-y-5">
            {POINTS.map(([title, body]) => (
              <li key={title} className="flex gap-3">
                <span aria-hidden="true" className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-gradient-to-br from-gold to-green-light" />
                <span>
                  <span className="block font-semibold text-ink">{title}</span>
                  <span className="text-slate">{body}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section className="order-first lg:order-none lg:pt-6">
          <SignupFlow open={open} questions={SIGNUP_QUESTIONS} />
        </section>
      </div>
    </PlatformShell>
  );
}
